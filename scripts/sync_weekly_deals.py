"""Weekly deal sync: Airtable (reviewed, approved deals) -> Supabase
curated_deals, then recompute every recipe's deal_tags against the fresh
data. Run this after finishing the week's Airtable review.

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


def sync_curated_deals(records):
    usable = [
        r for r in records
        if r["fields"].get("Select") == "Approved" and r["fields"].get("status") in ("recipes", "deals", "both")
    ]
    print(f"{len(usable)} approved+classified rows out of {len(records)} total")

    rows = []
    for r in usable:
        f = r["fields"]
        image = f.get("image")
        image_url = f"{SUPABASE_URL}/storage/v1/object/public/deal-thumbnails/{image[0]['filename']}" if image else None
        rows.append({
            "chain_name": f["chain_name"],
            "item_name": f["item_name"],
            "category": f.get("category"),
            "price": f["price"],
            "original_price": f.get("original_price"),
            "product_url": f.get("product_url"),
            "flyer_valid_from": f.get("flyer_valid_from"),
            "flyer_valid_to": f.get("flyer_valid_to"),
            "image_url": image_url,
            "status": "approved",
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
    need this at all -- the flyer's own numbers already answer it."""
    produce_deals = [
        r["fields"] for r in usable_records
        if "produce" in (r["fields"].get("category") or "").lower()
        and r["fields"].get("status") in ("recipes", "both")
        and r["fields"].get("original_price") is None
    ]
    if not produce_deals:
        print("no price-only produce deals this week")
        return

    statcan_rows = fetch_statcan_prices()
    already_covered = set(supabase_get_column("produce_reference_prices", "ingredient_name"))

    existing_gaps = fetch_airtable_table(GAPS_TABLE)
    # Once an item's been flagged before, resolved or not, don't ask again --
    # re-adding it every week it happens to reappear price-only would just
    # be noise.
    flagged_names = {g["fields"].get("Item Name") for g in existing_gaps}

    new_gaps = 0
    auto_resolved = 0
    for deal in produce_deals:
        if deal["item_name"] in flagged_names or deal["item_name"] in already_covered:
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

        # typecast lets Airtable add a new option to the "Chain" single-select
        # field automatically, instead of rejecting any chain not already listed.
        body = json.dumps({"fields": fields, "typecast": True}).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(GAPS_TABLE)}",
            data=body, method="POST",
            headers={
                "Authorization": f"Bearer {AIRTABLE_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req):
            pass
        flagged_names.add(deal["item_name"])
        new_gaps += 1

    print(f"flagged {new_gaps} new price-only produce gaps ({auto_resolved} auto-resolved via StatCan) out of {len(produce_deals)} candidates")


def rehost_produce_image(image_field, record_id):
    """Downloads a Produce Reference Gaps row's flyer cutout (an Airtable
    attachment -- short-lived signed URL, expires on Airtable's own
    schedule, not ours) and re-uploads it to the same Supabase Storage
    bucket the main Deals pipeline's images already live in
    (deal-thumbnails), so produce-gap deals get a stable, permanent URL
    exactly like every other curated_deals image instead of one that goes
    stale between weekly syncs. Best-effort: returns None (not a crash) if
    there's no image or the fetch/upload fails, since a missing image is a
    cosmetic gap, not a reason to fail the whole sync."""
    if not image_field:
        return None
    try:
        src_url = image_field[0]["url"]
        content_type = image_field[0].get("type", "image/jpeg")
        ext = ".jpg" if "jpeg" in content_type or "jpg" in content_type else ".png"
        filename = re.sub(r"[^A-Za-z0-9]+", "_", "produce_" + str(record_id)).strip("_") + ext

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
    in -- see rehost_produce_image() -- rather than storing Airtable's own
    attachment URL directly, since that URL is a short-lived signed link
    that expires on Airtable's schedule, not ours.

    The produce_reference_prices sync and the curated_deals push are
    deliberately NOT gated by the same condition, even though they used
    to be: "Resolved" means "the reference price has been recorded" --
    a one-time thing, correctly skipped on repeat runs. But curated_deals
    is wiped and rebuilt every week by sync_curated_deals() (deals are
    this-week-only) -- so a produce item resolved in an earlier week (or
    before this curated_deals-push feature even existed) would otherwise
    never get its deal row rebuilt, since the row that used to add it was
    skipped entirely once Resolved. The push now runs for every approved,
    priced row on every sync, regardless of Resolved."""
    gaps = fetch_airtable_table(GAPS_TABLE)
    resolved = 0
    deals_pushed = 0
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

            patch_body = json.dumps({"fields": {"Resolved": True}}).encode("utf-8")
            patch_req = urllib.request.Request(
                f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(GAPS_TABLE)}/{g['id']}",
                data=patch_body, method="PATCH",
                headers={
                    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(patch_req):
                pass
            resolved += 1

        # Runs every sync, Resolved or not -- see docstring.
        if f.get("Chain") and f.get("Price") is not None and price > f["Price"]:
            valid_from = f.get("Week Flagged") or date.today().isoformat()
            valid_to = (date.fromisoformat(valid_from) + timedelta(days=6)).isoformat()
            image_url = rehost_produce_image(f.get("Image"), g["id"])
            deal_row = {
                "chain_name": f["Chain"],
                "item_name": f["Item Name"],
                "category": "Produce",
                "price": f["Price"],
                "original_price": round(price, 2),
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
        # else: the approved reference price isn't actually higher than the
        # flyer's sale price -- not a real discount, so no deal to push
        # (still saved to produce_reference_prices above either way).

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
    generic staple list."""
    gaps = fetch_airtable_table(STAPLE_GAPS_TABLE)
    resolved = 0
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

        patch_body = json.dumps({"fields": {"Resolved": True}}).encode("utf-8")
        patch_req = urllib.request.Request(
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(STAPLE_GAPS_TABLE)}/{g['id']}",
            data=patch_body, method="PATCH",
            headers={
                "Authorization": f"Bearer {AIRTABLE_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(patch_req):
            pass
        resolved += 1

    print(f"resolved {resolved} staple reference gaps into staple_reference_prices")


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
    generic staple list."""
    gaps = fetch_airtable_table(STAPLE_GAPS_TABLE)
    resolved = 0
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

        patch_body = json.dumps({"fields": {"Resolved": True}}).encode("utf-8")
        patch_req = urllib.request.Request(
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(STAPLE_GAPS_TABLE)}/{g['id']}",
            data=patch_body, method="PATCH",
            headers={
                "Authorization": f"Bearer {AIRTABLE_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(patch_req):
            pass
        resolved += 1

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
    flag_produce_gaps(usable)  # so this week's gap check sees them and skips re-flagging
    resolve_staple_gaps()
    refresh_deal_tags()
    print("Done -- curated_deals and every recipe's deal_tags now reflect this week's approved deals.")
