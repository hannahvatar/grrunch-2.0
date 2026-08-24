"""Weekly deal sync: Airtable (AI-classified deal candidates, minus the
review agents' own obvious-junk rejects) -> Supabase curated_deals as
'pending', then recompute every recipe's deal_tags against the fresh
data. Anabelle: "why do I approve deals twice: in Airtable and in the
page dev-deals" -- her one human review (approve/correct/reject, and
confirm/correct the recipes/deals/both usage classification) now
happens entirely in app/app/dev-deals.tsx, not in Airtable. Run this
after the week's flyer candidates have been scanned into Airtable.

Also flags produce deals with no reference price anywhere (StatCan
doesn't track most produce, and we don't want AI-guessed prices mixed
with human-verified ones) into a second Airtable table, "Produce
Reference Gaps" -- and pulls back any gap rows a human has since filled
in, upserting them into Supabase produce_reference_prices. See
supabase/migrations/20260801000000_produce_reference_prices.sql.

Also pulls approved rows from a third Airtable table, "Staple Reference
Gaps" (a small, manually-maintained generic staple list -- not
auto-flagged from anything), into staple_reference_prices as
checked_by='human_verified'. No AI-guessed prices are trusted in the
matching chain -- only StatCan or an explicitly human-verified entry.

Usage:
    cd scripts && cp .env.example .env  # fill in AIRTABLE_TOKEN and
                                          # SUPABASE_SERVICE_ROLE_KEY once
    python3 sync_weekly_deals.py

deal_tags matching itself is NOT done here -- it's a Postgres function
(refresh_recipe_deal_tags, see supabase/migrations/20260730000000_auto_refresh_deal_tags.sql)
so it stays deterministic and versioned in the schema rather than re-implemented
per script. This file only pushes curated_deals, then calls that function.
"""

import json
import os
import urllib.parse
import urllib.request
import re
from datetime import date, timedelta


def _load_env_file():
    """.env isn't picked up automatically by the shell or by os.environ --
    this reads scripts/.env (if present) and fills in anything not already
    set in the real environment, so `cp .env.example .env` + fill-in
    actually works as documented below."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file()


def env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise SystemExit(f"Missing required env var: {name} (see .env.example)")
    return value

AIRTABLE_TOKEN = env("AIRTABLE_TOKEN")
AIRTABLE_BASE_ID = env("AIRTABLE_BASE_ID")
SUPABASE_URL = env("SUPABASE_URL")
SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY")

GAPS_TABLE = "Produce Reference Gaps"
STAPLE_GAPS_TABLE = "Staple Reference Gaps"

# Anabelle's call (2026-08-12): T&T Supermarket's flyer pricing was an 86%
# rejection rate in review ("the way they display their prices cannot
# really give me insight if its legit or not") -- dropped as a source
# entirely for now, not a permanent decision. Deliberately a simple,
# reversible skip here (not a deeper Airtable-side change) so re-adding
# T&T later is just removing a name from this set. All 6 previously-
# approved T&T rows were rejected by hand the same day; this only stops
# NEW T&T rows from being approved in future weekly syncs.
EXCLUDED_CHAINS = {"T&T Supermarket"}

# Real bug, hit TWICE now (once from a hand-built candidate batch
# earlier this session, once from scan_flat_priced_deals.py setting
# product_url to "" instead of a real URL) -- curated_deals.product_url
# is NOT NULL, and Airtable's own API silently OMITS a text field
# entirely when its value is an empty string (returns it as genuinely
# absent, not present-but-empty) -- so any upstream candidate-creation
# path that ever writes "" for product_url causes f.get("product_url")
# below to see None, and the whole weekly sync fails PARTWAY THROUGH,
# after the wipe has already run -- a real, live "0 deals" outage both
# times. Falling back to a real per-chain flyer URL here means this
# entire bug class can't recur regardless of which script upstream
# forgets to set a real product_url -- the sync itself is now the one
# place that has to get this right, not every candidate-creation path.
CHAIN_URLS = {
    "Walmart": "https://www.walmart.ca/en/flyer",
    "No Frills": "https://www.nofrills.ca/en/deals/flyer",
    "Real Canadian Superstore": "https://www.realcanadiansuperstore.ca/en/deals/flyer",
    "T&T Supermarket": "https://www.tnt-supermarket.com/flyer",
    "Safeway": "https://www.safeway.ca/flyer",
    "Save-On-Foods": "https://www.saveonfoods.com/flyer",
}

# Mirrors normalize_words() in the Postgres function and lib/staplePrices.ts
# -- same rule everywhere: lowercase, strip punctuation, drop short/generic
# words, then a subset match rather than exact-string equality.
STOPWORDS = {"with", "from", "each", "selected", "variety", "varieties", "fresh", "frozen"}


def normalize_words(text):
    words = re.split(r"[^a-z0-9]+", (text or "").lower())
    return [w for w in words if len(w) > 3 and w not in STOPWORDS]


def fetch_airtable_table(table_name):
    records = []
    offset = None
    while True:
        url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(table_name)}?pageSize=100"
        if offset:
            url += f"&offset={offset}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AIRTABLE_TOKEN}"})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        records.extend(data["records"])
        offset = data.get("offset")
        if not offset:
            break
    return records


def fetch_airtable_records():
    return fetch_airtable_table("Deals")


def wipe_airtable_table(table_name):
    """Deletes every record in an Airtable table. Airtable's batch delete
    takes at most 10 record ids per request."""
    record_ids = [r["id"] for r in fetch_airtable_table(table_name)]
    for i in range(0, len(record_ids), 10):
        batch = record_ids[i:i + 10]
        params = "&".join(f"records[]={rid}" for rid in batch)
        req = urllib.request.Request(
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(table_name)}?{params}",
            method="DELETE",
            headers={"Authorization": f"Bearer {AIRTABLE_TOKEN}"},
        )
        with urllib.request.urlopen(req):
            pass
    return len(record_ids)


# Real bug, caught live (Anabelle's workspace hit 80%, then 93%, of the
# Free plan's 1,000 Airtable API calls/month, with ALL of it attributed
# to this script's own token -- confirmed via the workspace's Usage tab:
# 0 Automation runs, 0 Sync integrations, 934 calls under "Other, PAT").
# wipe_airtable_table() above already batches its DELETE calls (max 10
# ids/request), but flag_produce_gaps()/resolve_produce_gaps()/
# resolve_staple_gaps() below were each issuing one Airtable CREATE or
# PATCH call PER RECORD in a loop, even though Airtable's batch create/
# update endpoints accept the exact same "up to 10 records per request"
# shape the batch delete already uses. A run that touches 30 gap rows
# was making 30 calls where it could make ~3. These two helpers give
# every per-record write loop in this file the same batching wipe_
# airtable_table() already had, without changing what gets written.
def batch_create_airtable(table_name, records_fields):
    """records_fields: list of `fields` dicts to create. Returns the
    created records (Airtable preserves input order in the response),
    so a caller needing the new record ids back can zip() them against
    records_fields."""
    created = []
    for i in range(0, len(records_fields), 10):
        batch = records_fields[i:i + 10]
        body = json.dumps({
            "records": [{"fields": f} for f in batch],
            "typecast": True,
        }).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(table_name)}",
            data=body, method="POST",
            headers={
                "Authorization": f"Bearer {AIRTABLE_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req) as resp:
            created.extend(json.loads(resp.read())["records"])
    return created


def batch_update_airtable(table_name, updates):
    """updates: list of (record_id, fields) tuples to PATCH."""
    for i in range(0, len(updates), 10):
        batch = updates[i:i + 10]
        body = json.dumps({
            "records": [{"id": rid, "fields": f} for rid, f in batch],
        }).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(table_name)}",
            data=body, method="PATCH",
            headers={
                "Authorization": f"Bearer {AIRTABLE_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req):
            pass


def fetch_reviewed_pricing():
    """Real bug, caught live (Anabelle: "ok deals are approved now" --
    checking the resulting recipe prices afterward found the drumsticks
    price_unit fix from earlier this same session had silently reverted
    to 'package'). sync_curated_deals() wipes and rebuilds curated_deals
    from scratch on every run, straight from Airtable's own raw fields
    (chain_name/item_name/price/etc.) -- but price_unit,
    package_weight_g, package_weight_g_source, and fragment_by_weight
    are Supabase-only refinements, made by hand in dev-deals.tsx AFTER
    a row already exists, and never written back to Airtable. Every
    weekly resync was silently discarding that whole review pass and
    resetting every item back to the 'package'/null defaults, even
    though the SAME underlying Airtable record (airtable_record_id
    stays stable across syncs -- re-approving a record doesn't create a
    new one) was already correctly reviewed.

    Fetches the previously-reviewed pricing fields, keyed by
    airtable_record_id, for every row where pricing_reviewed_at is set
    -- the same "a human actually saved this in dev-deals.tsx" signal
    update-curated-deal-pricing/index.ts stamps on every save -- so
    sync_curated_deals() can carry them forward onto this week's fresh
    rows instead of quietly reverting them. Called BEFORE the wipe.

    Also carries `usage` (recipes/deals/both) -- same reasoning, same
    exact bug class: if Anabelle corrects a recurring item's
    classification in dev-deals.tsx (see 20260819010000_curated_deals_
    usage_classification.sql), that correction would otherwise get
    silently reverted back to whatever Airtable's raw "status" field
    says every single week, same as price_unit used to."""
    url = (
        f"{SUPABASE_URL}/rest/v1/curated_deals"
        "?pricing_reviewed_at=not.is.null"
        "&select=airtable_record_id,price_unit,package_weight_g,package_weight_g_source,fragment_by_weight,usage,pricing_reviewed_at"
    )
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_ROLE,
        "Authorization": f"Bearer {SERVICE_ROLE}",
    })
    with urllib.request.urlopen(req) as resp:
        rows = json.loads(resp.read())
    return {r["airtable_record_id"]: r for r in rows if r["airtable_record_id"]}


def sync_curated_deals(records):
    # OLD gate required Select == "Approved" -- a human had already
    # signed off in Airtable before a row could even reach Supabase.
    # Anabelle: "why do I approve deals twice: in Airtable and in the
    # page dev-deals" -- that whole gate is removed here; her ONE
    # review now happens entirely in dev-deals.tsx, on rows synced as
    # 'pending'.
    #
    # Still excluded: Select == "reject" -- one of the 9 zone-review
    # agents' own audit signal that a candidate is obviously not a real
    # deal (garbage OCR, a non-price tile, etc.), set at scan time, no
    # human involved. Keeping this exclusion means her weekly dev-deals
    # queue stays the same size it always was for genuine candidates --
    # it just skips the redundant Airtable click, it doesn't dump every
    # zone agent's raw noise on her too.
    usable = [
        r for r in records
        if r["fields"].get("Select") != "reject"
        and r["fields"].get("status") in ("recipes", "deals", "both")
        and r["fields"].get("chain_name") not in EXCLUDED_CHAINS
    ]
    print(f"{len(usable)} classified rows out of {len(records)} total (excluding agent-rejected)")

    reviewed_pricing = fetch_reviewed_pricing()
    carried_forward = 0

    rows = []
    for r in usable:
        f = r["fields"]
        image_url = rehost_image(f.get("image"), r["id"], "deal")
        rows.append({
            "chain_name": f["chain_name"],
            "item_name": f["item_name"],
            "category": f.get("category"),
            "price": f["price"],
            "original_price": f.get("original_price"),
            # A real "Reg. $X" the store printed on the flyer -- this
            # whole path (Airtable's "Deals" table) never invents or
            # backfills original_price, so it's always flyer-sourced
            # when present. See resolve_produce_gaps() below for the
            # other, reference-sourced path.
            "original_price_source": "flyer",
            "product_url": f.get("product_url") or CHAIN_URLS.get(f["chain_name"], ""),
            "flyer_valid_from": f.get("flyer_valid_from"),
            "flyer_valid_to": f.get("flyer_valid_to"),
            "image_url": image_url,
            # Every row now lands as 'pending' -- dev-deals.tsx is the
            # single review step that promotes it to 'approved' (or
            # 'rejected'). Note: this means a RECURRING item (same
            # airtable_record_id, already reviewed in a prior week)
            # still comes back as 'pending' every week -- status isn't
            # one of the fields fetch_reviewed_pricing() carries
            # forward, on purpose (a stale approval shouldn't silently
            # bless THIS week's fresh price without a human glance).
            "status": "pending",
            # Passthrough of Airtable's own "recipes/deals/both"
            # classification -- just the starting point, not the final
            # word: freely re-correctable in dev-deals.tsx from here on
            # (see supabase/migrations/20260819010000_curated_deals_
            # usage_classification.sql). Airtable's field still has 3
            # options, but Supabase's own `usage` column was simplified
            # to a clean recipes/deals binary once "both" turned out to
            # be redundant (see 20260819030000_curated_deals_usage_
            # drop_both.sql -- Anabelle: "oh yeah got it both is now
            # redundant") -- fold Airtable's legacy "both" into
            # "recipes" here, which is what "both" always functionally
            # meant for recipe-matching purposes anyway.
            "usage": "recipes" if f["status"] == "both" else f["status"],
            "airtable_record_id": r["id"],
            # A deal's own generic category tags (e.g. "chicken breast"),
            # assigned by hand during this week's review -- see
            # 20260808040000_deal_keyword_matches.sql. Lets a recipe
            # ingredient still match a DIFFERENTLY-branded deal in a
            # future week's flyer, as long as this week's and that
            # week's deal share a keyword. Empty for most deals --
            # only worth tagging a genuinely generic category, never a
            # specialty/branded item that should stay matched to its
            # own exact name.
            "keyword_matches": f.get("keyword_matches") or [],
        })
        prior = reviewed_pricing.get(r["id"])
        if prior:
            rows[-1].update({
                "price_unit": prior["price_unit"],
                "package_weight_g": prior["package_weight_g"],
                "package_weight_g_source": prior["package_weight_g_source"],
                "fragment_by_weight": prior["fragment_by_weight"],
                "usage": prior["usage"],
                "pricing_reviewed_at": prior["pricing_reviewed_at"],
            })
            carried_forward += 1
    if carried_forward:
        print(f"carried forward {carried_forward} previously-reviewed pricing row(s) (price_unit/package_weight_g/fragment_by_weight)")

    # Real bug, caught live (Anabelle: "now there are each duplicated
    # twice" -- 4 Amy's Kitchen rows in dev-deals.tsx for what's really
    # one promo). The 9 zone-review agents that build Airtable "Deals"
    # candidates each work one zone at a time, blind to every other
    # zone -- so the same national/regional chain promo (e.g. Real
    # Canadian Superstore's Amy's Kitchen tile) independently produces
    # its own candidate row in EVERY zone that chain has, each with
    # identical chain_name/item_name/price. curated_deals has no
    # city/zone column, so these are indistinguishable duplicates to
    # both the reviewer and the shopper -- found affecting 22 items,
    # 27 redundant rows out of 85 approved (up to x3 for chains with 3
    # zones). Dedupe here, once, right before the row list is final --
    # keeps the first-seen row per (chain_name, item_name, price),
    # regardless of which zone/airtable_record_id it came from.
    #
    # item_name is normalized (whitespace-collapsed, case-folded) only
    # for the comparison key -- the stored row keeps its original text.
    # Caught live: two "HIGH LINER FAMILY FISH" rows differed only by a
    # missing space after the comma ("...FISH, 315-700 g" vs
    # "...FISH,315-700 g", almost certainly two zone-reviewers typing
    # the same tile slightly differently) and slipped past a naive
    # exact-string key.
    # Prefer a row carrying forward reviewed pricing (see
    # fetch_reviewed_pricing() above) over an arbitrary first-seen
    # duplicate -- otherwise this dedup step could itself discard the
    # one zone-duplicate that happened to be the reviewed one, silently
    # reintroducing the exact bug fetch_reviewed_pricing() exists to fix.
    best_by_key = {}
    dropped = 0
    for row in rows:
        norm_name = re.sub(r"\s+", " ", row["item_name"]).strip().casefold()
        key = (row["chain_name"], norm_name, row["price"])
        existing = best_by_key.get(key)
        if existing is None:
            best_by_key[key] = row
        elif row.get("pricing_reviewed_at") and not existing.get("pricing_reviewed_at"):
            best_by_key[key] = row
            dropped += 1
        else:
            dropped += 1
    if dropped:
        print(f"dropped {dropped} zone-duplicate row(s) (same chain+item+price from multiple zones)")
    rows = list(best_by_key.values())

    # Wipe last week's synced rows, then insert this week's full set --
    # curated_deals is explicitly this-week-only, never an accumulating history
    del_req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/curated_deals?id=neq.00000000-0000-0000-0000-000000000000",
        method="DELETE",
        headers={
            "apikey": SERVICE_ROLE,
            "Authorization": f"Bearer {SERVICE_ROLE}",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(del_req) as resp:
        print("wiped previous week's rows:", resp.status)

    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/curated_deals",
        data=body, method="POST",
        headers={
            "apikey": SERVICE_ROLE,
            "Authorization": f"Bearer {SERVICE_ROLE}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req) as resp:
        print("synced curated_deals:", resp.status)
    print(f"Synced {len(rows)} deals")
    return usable


def supabase_get_column(table, column):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={column}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_ROLE,
        "Authorization": f"Bearer {SERVICE_ROLE}",
    })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return [row[column] for row in data]


def fetch_statcan_prices():
    url = f"{SUPABASE_URL}/rest/v1/statcan_reference_prices?select=ingredient_name,avg_price,unit,reference_month"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_ROLE,
        "Authorization": f"Bearer {SERVICE_ROLE}",
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def match_statcan_price(ingredient_name, statcan_rows):
    """Same word-subset rule used everywhere else -- most-specific (most
    words) match wins, and a StatCan name that collapses to a single
    generic word once "fresh"/"frozen" is stripped (e.g. "Frozen corn" ->
    "corn") is rejected, since it'd otherwise match any ingredient
    containing that word, fresh or not."""
    ing_words = normalize_words(ingredient_name)
    best = None
    best_word_count = 0
    for row in statcan_rows:
        words = normalize_words(row["ingredient_name"])
        if not words:
            continue
        if len(words) == 1 and re.search(r"\b(fresh|frozen)\b", row["ingredient_name"], re.IGNORECASE):
            continue
        if all(w in ing_words for w in words) and len(words) > best_word_count:
            best = row
            best_word_count = len(words)
    return best


def fetch_produce_reference_prices():
    """{ingredient_name: {avg_price, unit}} for every row in
    produce_reference_prices -- the trusted, already-researched
    reference data flag_produce_gaps() uses both to avoid re-asking
    about an already-known item AND (see patch_produce_deal_from_
    reference() below) to auto-price it the next time it's price-only
    in a fresh flyer."""
    url = f"{SUPABASE_URL}/rest/v1/produce_reference_prices?select=ingredient_name,avg_price,unit"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_ROLE,
        "Authorization": f"Bearer {SERVICE_ROLE}",
    })
    with urllib.request.urlopen(req) as resp:
        rows = json.loads(resp.read())
    return {r["ingredient_name"]: {"avg_price": r["avg_price"], "unit": r["unit"]} for r in rows}


def patch_produce_deal_from_reference(deal, ref):
    """Restores the auto-fill Anabelle asked back for ("restore that
    auto-fill") after the 20260819 resolve_produce_gaps() fix
    accidentally killed it for any produce item already known once --
    see the comment at the already_covered check in flag_produce_gaps()
    for the full history.

    PATCHes original_price/original_price_source onto the curated_deals
    row sync_curated_deals() already created for THIS week's real
    candidate (same airtable_record_id) -- deliberately not a second
    insert, so nothing about this week's own price_unit/usage/image/
    etc. gets clobbered or duplicated. Only touches the row if the
    known reference price is actually higher than this week's flyer
    price (a real discount) -- same gate resolve_produce_gaps() itself
    uses, so an item that just isn't on sale this week doesn't get a
    fake "was more expensive" badge."""
    price = deal.get("price")
    if price is None or ref["avg_price"] is None or ref["avg_price"] <= price:
        return False
    body = json.dumps({
        "original_price": round(ref["avg_price"], 2),
        "original_price_source": "reference",
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/curated_deals?airtable_record_id=eq.{deal['_airtable_id']}",
        data=body, method="PATCH",
        headers={
            "apikey": SERVICE_ROLE,
            "Authorization": f"Bearer {SERVICE_ROLE}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req):
        pass
    return True


def flag_produce_gaps(usable_records):
    """The real gap this table exists for: a produce deal that's classified
    "recipes"/"both" and the flyer only gives a sale price for, with NO
    stated regular price -- so there's no way to tell if it's actually a
    good deal (e.g. blueberries advertised at $1.97/pint with no regular
    price shown). For each one, StatCan is checked first and used to
    auto-fill+resolve the row immediately if it has a match (no human
    needed, the question's already answered); otherwise the row is left
    blank for a human to fill in by hand (e.g. via grocerytracker.ca).
    A produce deal that already has BOTH price and original_price doesn't
    need this at all -- the flyer's own numbers already answer it.

    GAPS_TABLE (the "Produce Reference Gaps" Airtable table) is wiped
    clean right before this runs (see __main__) -- real bug, caught live
    (Anabelle: "should only display current flyers items dont keep
    previous weeks", and separately "there is a lot of duplicates").
    This table used to never get wiped at all -- every row ever flagged,
    back to whenever the pipeline first ran, just sat there forever,
    Approved/Rejected/blank all mixed together. Found stuck at 123 rows
    every one of them still dated "Week Flagged: 2026-07-30", three
    calendar weeks stale, because flag_produce_gaps() never re-flagged
    an item name it had already seen once (see flagged_names below) --
    the table simply couldn't shed anything, ever. What read as
    "duplicates" wasn't really duplicate rows (only 1 genuine exact-name
    repeat existed) -- it was 3+ weeks of legitimate but visually similar
    cross-chain produce listings (six different chains' own "Blueberries"
    variants, etc.) all piled into one view at once, with no way to tell
    old from current. Wiping weekly, same as the main "Deals" table
    already does, fixes both complaints at once: only this week's actual
    gaps are ever visible, and there's nothing stale left to look like
    clutter. Nothing is lost by the wipe -- resolve_produce_gaps() (which
    runs immediately before the wipe) has already drained every approved
    row into produce_reference_prices, and already_covered below is the
    real cross-week memory now, not the Airtable rows themselves."""
    # _airtable_id kept alongside the raw fields (not just r["fields"])
    # so patch_produce_deal_from_reference() below can match this
    # exact week's curated_deals row by airtable_record_id -- needed
    # for the already_covered auto-fill path, added when restoring
    # that behavior (see the comment at the already_covered check).
    produce_deals = [
        {**r["fields"], "_airtable_id": r["id"]} for r in usable_records
        if "produce" in (r["fields"].get("category") or "").lower()
        and r["fields"].get("status") in ("recipes", "both")
        and r["fields"].get("original_price") is None
    ]
    if not produce_deals:
        print("no price-only produce deals this week")
        return

    statcan_rows = fetch_statcan_prices()
    reference_prices = fetch_produce_reference_prices()
    already_covered = set(reference_prices)

    # GAPS_TABLE is wiped clean right before this runs (see __main__) --
    # so existing_gaps only ever holds rows created earlier IN THIS SAME
    # run (relevant if this function is ever called twice in one
    # process; harmless dedup either way). The real "don't ask about
    # this again" memory is already_covered (produce_reference_prices),
    # which persists across weeks regardless of what's in Airtable.
    existing_gaps = fetch_airtable_table(GAPS_TABLE)
    flagged_names = {g["fields"].get("Item Name") for g in existing_gaps}

    new_gaps = 0
    auto_resolved = 0
    auto_priced = 0
    pending_creates = []  # batched at the end -- see batch_create_airtable()
    for deal in produce_deals:
        if deal["item_name"] in already_covered:
            # Real bug, caught live (Anabelle: "Prior today we had
            # something produces and deals overall. I am not sure why
            # we are excluding them now" -- turned out to be a side
            # effect of the 20260819 resolve_produce_gaps() fix: once
            # an item's reference price is resolved, this
            # already_covered check has ALWAYS silently skipped it
            # forever, on the theory that resolve_produce_gaps() would
            # keep re-pushing a fresh curated_deals row for it anyway.
            # That was true before the 20260819 fix (it re-pushed every
            # single week, which was itself a bug -- permanently stale
            # dates) but FALSE after it (now pushes exactly once, ever,
            # at first resolution) -- so a produce item that's already
            # known could never become a priced deal again in any later
            # week, even with a brand new, genuine flyer markdown.
            #
            # Fixed here instead of by reviving the old "re-push
            # forever" behavior: patch_produce_deal_from_reference()
            # (below) fills in original_price on the row
            # sync_curated_deals() ALREADY created for this week's real
            # candidate (same airtable_record_id, same image, same
            # price_unit/usage) -- a targeted PATCH, not a second
            # insert, so nothing about this week's own data gets
            # clobbered or duplicated.
            ref = reference_prices[deal["item_name"]]
            if patch_produce_deal_from_reference(deal, ref):
                auto_priced += 1
            continue
        if deal["item_name"] in flagged_names:
            continue

        fields = {
            "Item Name": deal["item_name"],
            "Chain": deal["chain_name"],
            "Price": deal["price"],
            "Week Flagged": deal.get("flyer_valid_from"),
        }

        statcan_match = match_statcan_price(deal["item_name"], statcan_rows)
        if statcan_match:
            fields["Reference Price SC"] = statcan_match["avg_price"]
            fields["Unit"] = statcan_match["unit"]
            fields["Reference Date"] = statcan_match["reference_month"]
            fields["Resolved"] = True  # StatCan already answered it -- nothing for a human to do
            auto_resolved += 1
        else:
            fields["Resolved"] = False

        # typecast (passed by batch_create_airtable itself) lets Airtable
        # add a new option to the "Chain" single-select field
        # automatically, instead of rejecting any chain not already listed.
        pending_creates.append(fields)
        flagged_names.add(deal["item_name"])
        new_gaps += 1

    if pending_creates:
        batch_create_airtable(GAPS_TABLE, pending_creates)

    print(
        f"flagged {new_gaps} new price-only produce gaps ({auto_resolved} auto-resolved via StatCan), "
        f"auto-priced {auto_priced} from an already-known reference price, out of {len(produce_deals)} candidates"
    )


def rehost_image(image_field, record_id, prefix):
    """Downloads an Airtable attachment (short-lived signed URL, expires on
    Airtable's own schedule, not ours) and re-uploads it to the shared
    Supabase Storage bucket (deal-thumbnails) under a filename unique to
    this specific record, so it gets a stable, permanent URL instead of
    one that goes stale between weekly syncs. `prefix` keeps the two
    calling paths' filenames from colliding with each other (produce_ vs
    deal_) even though both share one flat bucket. Best-effort: returns
    None (not a crash) if there's no image or the fetch/upload fails,
    since a missing image is a cosmetic gap, not a reason to fail the
    whole sync.

    Real bug, caught live (Anabelle: "why AMY'S KITCHEN BURRITO... dont
    have image"): the main Deals pipeline (sync_curated_deals below)
    used to build image_url by guessing from the Airtable attachment's
    own `filename` field instead of actually re-hosting anything -- for
    every Flipp-sourced cutout that filename is literally always
    "extra_large.jpg" (the source CDN's own generic name, not per-item),
    so all 48 deals synced this way pointed at the exact same
    (never-actually-uploaded) Storage path. This function already did
    real re-hosting correctly for the OTHER caller (produce gaps) --
    generalized it (was rehost_produce_image, produce-only) so
    sync_curated_deals can share the same real fix instead of its own
    broken shortcut."""
    if not image_field:
        return None
    try:
        src_url = image_field[0]["url"]
        content_type = image_field[0].get("type", "image/jpeg")
        ext = ".jpg" if "jpeg" in content_type or "jpg" in content_type else ".png"
        filename = re.sub(r"[^A-Za-z0-9]+", "_", f"{prefix}_{record_id}").strip("_") + ext

        with urllib.request.urlopen(src_url) as resp:
            image_bytes = resp.read()

        upload_req = urllib.request.Request(
            f"{SUPABASE_URL}/storage/v1/object/deal-thumbnails/{filename}",
            data=image_bytes, method="POST",
            headers={
                "apikey": SERVICE_ROLE,
                "Authorization": f"Bearer {SERVICE_ROLE}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )
        with urllib.request.urlopen(upload_req):
            pass

        return f"{SUPABASE_URL}/storage/v1/object/public/deal-thumbnails/{filename}"
    except Exception as e:
        print(f"  warning: couldn't re-host image for {record_id}: {e}")
        return None


def resolve_produce_gaps():
    """Pulls any "Produce Reference Gaps" row that's been approved (Status
    == "Approved" -- same human-approval gate as curated_deals' own
    "Select" == "Approved" check) into produce_reference_prices, using
    "Anabelle" (human-sourced) if filled in, otherwise "Reference Price
    SC" (StatCan-sourced, pre-filled at flagging time but never trusted
    without approval -- see scan_produce_flyers.py).

    Also pushes a matching curated_deals row: the flyer's own sale price
    (Price) as price, the now-approved reference price as original_price
    -- so the item gets a real discount_pct, shows up in Best Deals, and
    earns proper recipe deal-tag credit / store attribution, instead of
    sitting as a reference number nobody but this script ever sees.
    Without this, an item like "NO NAME NATURALLY IMPERFECT SWEET
    PEPPERS, 2.5 LB" -- a genuine $6 deal with a real StatCan-backed
    regular price -- never appeared as an actual deal anywhere in the app.

    A produce gap row is a real deal, not a lesser/reference-only entry --
    so it must render identically to any other curated_deals item in the
    grocery list (image, price, discount tag), not fall back to a plain
    generic-staple line. The "Image" field (flyer cutout, added by
    scan_produce_flyers.py) is re-hosted to the same Supabase Storage
    bucket (deal-thumbnails) the main Deals pipeline's images already live
    in -- see rehost_image() -- rather than storing Airtable's own
    attachment URL directly, since that URL is a short-lived signed link
    that expires on Airtable's schedule, not ours.

    The curated_deals push runs ONLY at first resolution (same
    `if not f.get("Resolved")` gate as the produce_reference_prices
    sync), stamped with today's date as flyer_valid_from -- NOT with
    whatever "Week Flagged" says. Real bug, caught live (Anabelle:
    "CARIBBEAN AVOCADOS or OKRA should be a duplicate" -- while
    investigating, found the row's flyer had actually expired two
    calendar weeks earlier and was still showing as a "current" deal):
    a previous version of this function pushed the deal row on EVERY
    sync regardless of Resolved, using "Week Flagged" (the date the gap
    was first FLAGGED, not re-computed) as flyer_valid_from every time.
    Since curated_deals is otherwise this-week-only, that meant any
    produce item ever approved here kept re-appearing as a "current"
    deal in curated_deals forever, permanently stamped with its
    original flagging week's dates -- found 27 of 57 approved deals
    (every reference-sourced one) frozen at the exact same 2026-07-30 to
    2026-08-05 window, two weeks stale. Gating the push to
    first-resolution-only, with today's date, means a produce item
    becomes a real deal exactly once, the week it's approved -- same
    this-week-only lifecycle every other curated_deals row already has.
    A produce item that genuinely reappears in a later week's flyer
    isn't caught by this fix (flag_produce_gaps() already skips
    re-flagging anything in flagged_names) -- a separate, pre-existing
    gap, not something this fix needs to solve."""
    gaps = fetch_airtable_table(GAPS_TABLE)
    resolved = 0
    deals_pushed = 0
    pending_resolved = []  # (record_id, {"Resolved": True}) -- batched at the end
    for g in gaps:
        f = g["fields"]
        if f.get("Status") != "Approved":
            continue
        price = f.get("Anabelle")
        if price is None:
            price = f.get("Reference Price SC")
        if price is None or not f.get("Unit") or not f.get("Reference Date"):
            continue

        if not f.get("Resolved"):
            row = {
                "ingredient_name": f["Item Name"],
                "unit": f["Unit"],
                "avg_price": price,
                "reference_date": f["Reference Date"],
                "airtable_record_id": g["id"],
            }
            req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/produce_reference_prices?on_conflict=airtable_record_id",
                data=json.dumps(row).encode("utf-8"), method="POST",
                headers={
                    "apikey": SERVICE_ROLE,
                    "Authorization": f"Bearer {SERVICE_ROLE}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
            )
            with urllib.request.urlopen(req):
                pass

            pending_resolved.append((g["id"], {"Resolved": True}))
            resolved += 1

            # Pushed ONLY here, at first resolution -- see docstring for
            # why this must not run again on later syncs. valid_from is
            # today (the week this is actually being approved+pushed),
            # never "Week Flagged" (whenever it first got FLAGGED, which
            # could be weeks in the past by the time it's approved).
            if f.get("Chain") and f.get("Price") is not None and price > f["Price"]:
                valid_from = date.today().isoformat()
                valid_to = (date.fromisoformat(valid_from) + timedelta(days=6)).isoformat()
                image_url = rehost_image(f.get("Image"), g["id"], "produce")
                deal_row = {
                    "chain_name": f["Chain"],
                    "item_name": f["Item Name"],
                    "category": "Produce",
                    "price": f["Price"],
                    "original_price": round(price, 2),
                    # `price` here is a StatCan or human-researched
                    # comparison price (Airtable "Anabelle"/"Reference Price
                    # SC"), never anything printed on a flyer -- see
                    # supabase/migrations/20260812000000_curated_deals_original_price_source.sql.
                    "original_price_source": "reference",
                    "product_url": "",
                    "flyer_valid_from": valid_from,
                    "flyer_valid_to": valid_to,
                    "image_url": image_url,
                    "status": "approved",
                    "airtable_record_id": g["id"],
                }
                deal_req = urllib.request.Request(
                    f"{SUPABASE_URL}/rest/v1/curated_deals?on_conflict=airtable_record_id",
                    data=json.dumps(deal_row).encode("utf-8"), method="POST",
                    headers={
                        "apikey": SERVICE_ROLE,
                        "Authorization": f"Bearer {SERVICE_ROLE}",
                        "Content-Type": "application/json",
                        "Prefer": "resolution=merge-duplicates,return=minimal",
                    },
                )
                with urllib.request.urlopen(deal_req):
                    pass
                deals_pushed += 1
            # else: the approved reference price isn't actually higher than
            # the flyer's sale price -- not a real discount, so no deal to
            # push (still saved to produce_reference_prices above either way).

    if pending_resolved:
        batch_update_airtable(GAPS_TABLE, pending_resolved)

    print(f"resolved {resolved} produce reference gaps into produce_reference_prices, pushed {deals_pushed} curated deals")


def resolve_staple_gaps():
    """Same pattern as resolve_produce_gaps, for the "Staple Reference
    Gaps" table. Unlike produce, nothing ever gets written to Supabase
    without first appearing in Airtable for approval -- even a real
    StatCan number sits in "Reference Price SC" and waits for
    Status == "Approved" like everything else, rather than syncing
    straight to Supabase on its own.

    Pulls from "Anabelle" (human-sourced) if filled in, otherwise
    "Reference Price SC" (StatCan-sourced) -- either way the row is only
    trusted once approved. checked_by records which source actually won,
    for traceability. Unlike produce, this table isn't auto-flagged from
    flyers/recipes -- rows are added manually to a deliberately small,
    generic staple list.

    (This function used to be defined twice in this file, byte-for-byte
    identical -- harmless in Python, since the second def just silently
    wins, but real dead-code cruft. Deduped here while adding the same
    batched-PATCH fix every other per-record write loop in this file got.)"""
    gaps = fetch_airtable_table(STAPLE_GAPS_TABLE)
    resolved = 0
    pending_resolved = []  # (record_id, {"Resolved": True}) -- batched at the end
    for g in gaps:
        f = g["fields"]
        price = f.get("Anabelle")
        source = "human_verified"
        if price is None:
            price = f.get("Reference Price SC")
            source = "statcan"
        if (
            f.get("Resolved")
            or f.get("Status") != "Approved"
            or price is None
            or not f.get("Unit")
            or not f.get("Reference Date")
        ):
            continue

        row = {
            "ingredient_name": f["Item Name"],
            "category": f.get("Category") or "rounding_out_extra",
            "unit": f["Unit"],
            "avg_price": price,
            "last_checked_at": f["Reference Date"],
            "checked_by": source,
            "airtable_record_id": g["id"],
        }
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/staple_reference_prices?on_conflict=airtable_record_id",
            data=json.dumps(row).encode("utf-8"), method="POST",
            headers={
                "apikey": SERVICE_ROLE,
                "Authorization": f"Bearer {SERVICE_ROLE}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        with urllib.request.urlopen(req):
            pass

        pending_resolved.append((g["id"], {"Resolved": True}))
        resolved += 1

    if pending_resolved:
        batch_update_airtable(STAPLE_GAPS_TABLE, pending_resolved)

    print(f"resolved {resolved} staple reference gaps into staple_reference_prices")


def refresh_deal_tags():
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/refresh_recipe_deal_tags",
        data=b"{}", method="POST",
        headers={
            "apikey": SERVICE_ROLE,
            "Authorization": f"Bearer {SERVICE_ROLE}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        print("refreshed recipe deal_tags:", resp.status)


if __name__ == "__main__":
    records = fetch_airtable_records()
    usable = sync_curated_deals(records)
    resolve_produce_gaps()  # pull in any prices filled in since last run first,
    # so nothing approved-but-not-yet-processed is lost to the wipe below --
    # see flag_produce_gaps()'s own docstring for why this table is wiped
    # weekly (Anabelle: "should only display current flyers items dont
    # keep previous weeks" / "there is a lot of duplicates").
    wiped = wipe_airtable_table(GAPS_TABLE)
    print(f"wiped {wiped} previous-week row(s) from \"{GAPS_TABLE}\"")
    flag_produce_gaps(usable)  # re-flags fresh against this week's actual data
    resolve_staple_gaps()
    refresh_deal_tags()
    print("Done -- curated_deals and every recipe's deal_tags now reflect this week's approved deals.")
