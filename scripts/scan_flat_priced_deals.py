"""Scans raw flyer.json files for flat-priced items with NO discount
signal at all in the flyer itself, and cross-checks each one against
the trusted reference-price tables already in Supabase
(statcan_reference_prices, produce_reference_prices,
staple_reference_prices).

Why this exists: Anabelle hand-checked one zone's raw flyer.json
against what actually became Airtable "Deals" candidates that week and
found a real gap ("so many in here dont appear here"). Investigating
showed the existing candidate-creation process only proposes an item
when the flyer itself shows an explicit "X% off" badge
(items.csv/flyer.json's own `discount`/`discount_flag` field) --
confirmed correct for THAT narrow case (every item with a real
discount badge and a machine-readable price made it in). But most
flyer items showing a flat price with NO visible comparison at all
(most meat/seafood/produce/deli -- checked several cutouts by hand:
Steelhead Fillet $3.99/100g, Hot House Tomatoes $2.99/lb, Grimm's
Sausage Rings $13.79 -- none show a discount) never even get
considered, since nothing in the flyer flags them. Some of those ARE
genuinely good value against a trusted reference price -- there was
just never a step that checked.

This script is that step: for every priced item, do a word-subset
match (same convention as refresh_recipe_deal_tags()'s staple-fallback
tier: statcan_reference_prices -> produce_reference_prices ->
staple_reference_prices, most-specific match wins, staple rows gated
on checked_by != 'ai_estimated') and flag it if the trusted reference
price is meaningfully higher than this week's flyer price -- a real,
computable bargain, even though the flyer never says so.

Dry-run by default -- only prints what it found. Pass --create to
actually push matches as new Airtable "Deals" candidates
(Select: Pending -- still needs Anabelle's normal one-screen review in
dev-deals, this script never auto-approves anything). original_price
is deliberately left blank on creation -- the next weekly sync's own
auto-fill (see patch_produce_deal_from_reference() in
sync_weekly_deals.py, now covering any category, not just produce)
fills it in from the SAME reference tables, once the row exists -- one
source of truth for "what counts as the reference price," not
duplicated here.

Two usage modes:

  Single zone (spot-check):
    python3 scan_flat_priced_deals.py <flyer.json path> <chain_name> [--create]

  All zones in a fetched week (cross-zone deduped):
    python3 scan_flat_priced_deals.py --week-dir <week folder> [--create]

  --week-dir auto-discovers every "<chain-slug>--<zone-slug>" folder
  under the given week directory, maps the slug back to a real chain
  name (CHAIN_NAME_MAP below), scans each one, then collapses matches
  across zones by (chain_name, normalized item_name, price) BEFORE
  creating anything -- Anabelle: "I still want the approved deal to
  show accross zones and banners for the users on their matching
  location or preferred stores" -- confirmed safe: curated_deals has
  no zone/location column at all, deal visibility is matched purely by
  chain_name against a user's nearby stores (see app/lib/curatedDeals.ts,
  the separate `stores` table), so a deal never carries zone-specific
  visibility to begin with -- collapsing same chain+item+price across
  zones loses nothing a user would ever see differently.

Example:
    python3 scan_flat_priced_deals.py --week-dir \\
      "$HOME/Desktop/Grrunch/Database/Weekly/grrunch_flyers/2026-08-13" --create
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


def _load_env_file():
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


def env(name):
    value = os.environ.get(name)
    if value is None:
        sys.exit(f"Missing required env var: {name} (see .env.example)")
    return value


SUPABASE_URL = env("SUPABASE_URL")
SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY")
AIRTABLE_TOKEN = env("AIRTABLE_TOKEN")
AIRTABLE_BASE_ID = env("AIRTABLE_BASE_ID")
DEALS_TABLE = "Deals"

# Zone folder slug prefix -> real chain_name, matching the exact
# strings Airtable/curated_deals already use elsewhere (see
# sync_weekly_deals.py's EXCLUDED_CHAINS and every chain_name value
# already live in curated_deals). Extend this if a new chain is added
# to grrunch_weekly_downloads.csv.
CHAIN_NAME_MAP = {
    "safeway": "Safeway",
    "save-on-foods": "Save-On-Foods",
    "real-canadian-superstore": "Real Canadian Superstore",
    "walmart": "Walmart",
    "no-frills": "No Frills",
    "t-t": "T&T Supermarket",
}

# Mirrors sync_weekly_deals.py's own normalize_words() exactly -- same
# rule everywhere: lowercase, strip punctuation, drop short/generic
# words, then a subset match rather than exact-string equality.
STOPWORDS = {"with", "from", "each", "selected", "variety", "varieties", "fresh", "frozen"}


def normalize_words(text):
    words = re.split(r"[^a-z0-9]+", (text or "").lower())
    return [w for w in words if len(w) > 3 and w not in STOPWORDS]


def supabase_get(table, select):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_ROLE,
        "Authorization": f"Bearer {SERVICE_ROLE}",
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def fetch_reference_tiers():
    statcan_rows = supabase_get("statcan_reference_prices", "ingredient_name,avg_price,unit")
    produce_rows = supabase_get("produce_reference_prices", "ingredient_name,avg_price,unit")
    staple_rows = [
        r for r in supabase_get("staple_reference_prices", "ingredient_name,avg_price,unit,checked_by")
        if r.get("checked_by") != "ai_estimated"
    ]
    print(f"matching against {len(statcan_rows)} statcan + {len(produce_rows)} produce + {len(staple_rows)} trusted staple reference rows")
    # Real bug, caught in dry-run review before ever creating a single
    # Airtable row: statcan_reference_prices has NO category column at
    # all (confirmed against the live schema) -- it covers meat, dairy,
    # produce, bakery, pantry, everything StatCan's CPI food basket
    # tracks, not just meat. Hardcoding "Meat & Seafood" for every
    # statcan match mislabeled grapes, vegetable oil, and orange juice
    # as meat. Only produce_reference_prices is safe to auto-label
    # (that table IS produce-only by construction) -- statcan/staple
    # matches leave category unset, same as any other candidate
    # Anabelle classifies by hand in dev-deals.
    return [
        ("statcan", None, statcan_rows),
        ("produce", "Produce", produce_rows),
        ("staple", None, staple_rows),
    ]


def best_match(item_name, tiers):
    """tiers: list of (source_label, category, rows) tuples. Real bug,
    caught live (Anabelle: "what do i do when reference price is
    wrong? E.g. AROY-D COCONUT MILK, 400 ML statcan ref is just
    'Milk'" -- while a correctly-priced "Coconut milk" entry already
    existed in staple_reference_prices). This used to check tiers IN
    ORDER and return as soon as the FIRST tier had any match at all --
    so a weak, generic single-word statcan match ("Milk") would win
    even when a far more specific, correct match sat unused in a later
    tier. Same fix applied to the SQL twin of this function
    (find_reference_price() and refresh_recipe_deal_tags()'s own
    staple-fallback tier, see 20260820000000_reference_tier_most_
    specific_wins.sql): check ALL tiers unconditionally, keep whichever
    match has the MOST words overall -- ties broken by tier order
    (statcan -> produce -> staple) via strict `>` comparison, which
    naturally keeps the first-seen entry on a tie. A reference name
    that collapses to a single generic word after stripping "fresh"/
    "frozen" is rejected -- same guard as match_statcan_price() in
    sync_weekly_deals.py, since it'd otherwise match anything
    containing that one word."""
    item_words = normalize_words(item_name)
    best = None
    best_source = None
    best_category = None
    best_word_count = 0
    for source_label, category, rows in tiers:
        for row in rows:
            words = normalize_words(row["ingredient_name"])
            if not words:
                continue
            if len(words) == 1 and re.search(r"\b(fresh|frozen)\b", row["ingredient_name"], re.IGNORECASE):
                continue
            if all(w in item_words for w in words) and len(words) > best_word_count:
                best = row
                best_source = source_label
                best_category = category
                best_word_count = len(words)
    if best is not None:
        return best_source, best_category, best, best_word_count
    return None


def scan_zone(flyer_path, chain_name, tiers):
    """Returns the list of match dicts for one zone's flyer.json --
    no printing, no Airtable writes. Reused by both single-zone and
    --week-dir modes."""
    with open(flyer_path) as f:
        flyer = json.load(f)
    items = flyer.get("items", [])

    matches = []
    seen_names = set()
    for item in items:
        name = item.get("name")
        price_raw = item.get("price")
        if not name or price_raw in (None, ""):
            continue
        try:
            price = float(price_raw)
        except (TypeError, ValueError):
            continue
        if item.get("discount"):
            continue  # already has a real flyer-printed discount signal -- not this script's job
        if name in seen_names:
            continue  # only report each distinct item name once per zone

        result = best_match(name, tiers)
        if result is None:
            continue
        source_label, category, ref, word_count = result
        if ref["avg_price"] is None or ref["avg_price"] <= price:
            continue  # not actually a discount vs. the trusted reference

        seen_names.add(name)
        matches.append({
            "item_name": name,
            "chain_name": chain_name,
            "category": category,
            "price": price,
            "cutout_image_url": item.get("cutout_image_url"),
            "flyer_valid_from": (item.get("valid_from") or "")[:10],
            "flyer_valid_to": (item.get("valid_to") or "")[:10],
            "reference_source": source_label,
            "reference_match": ref["ingredient_name"],
            "reference_price": ref["avg_price"],
            "reference_unit": ref["unit"],
            "match_word_count": word_count,
        })
    return matches


def print_matches(matches, heading):
    print(f"\n{len(matches)} {heading}:")
    for m in matches:
        weak = " [weak: 1-word match, double-check]" if m["match_word_count"] == 1 else ""
        zone_note = f" ({m['zone']})" if "zone" in m else ""
        print(
            f"  {m['item_name']!r} (${m['price']}, {m['chain_name']}{zone_note}) vs. reference {m['reference_match']!r} "
            f"(${m['reference_price']}/{m['reference_unit']}, via {m['reference_source']}) "
            f"-> category {m['category']}{weak}"
        )


# Real bug, caught live (found the hard way: an empty string here
# caused a genuine outage -- curated_deals.product_url is NOT NULL,
# and Airtable's API omits an empty text field entirely when read back
# rather than returning "" -- so sync_weekly_deals.py's
# f.get("product_url") saw None, not "", and the insert failed with a
# not-null violation partway through, AFTER the weekly wipe had
# already run -- 0 deals live until caught and fixed. Same exact bug
# class as an earlier session's CHAIN_URLS fix in sync_weekly_deals.py
# -- reusing the same real per-chain flyer URLs here instead of "".
CHAIN_URLS = {
    "Walmart": "https://www.walmart.ca/en/flyer",
    "No Frills": "https://www.nofrills.ca/en/deals/flyer",
    "Real Canadian Superstore": "https://www.realcanadiansuperstore.ca/en/deals/flyer",
    "T&T Supermarket": "https://www.tnt-supermarket.com/flyer",
    "Safeway": "https://www.safeway.ca/flyer",
    "Save-On-Foods": "https://www.saveonfoods.com/flyer",
}


def create_candidates(matches):
    created = 0
    for m in matches:
        fields = {
            "chain_name": m["chain_name"],
            "item_name": m["item_name"],
            "category": m["category"],
            "price": m["price"],
            "product_url": CHAIN_URLS.get(m["chain_name"], ""),
            "flyer_valid_from": m["flyer_valid_from"],
            "flyer_valid_to": m["flyer_valid_to"],
            "Select": "Pending",
            "status": "recipes",
        }
        if m["cutout_image_url"]:
            fields["image"] = [{"url": m["cutout_image_url"]}]
        body = json.dumps({"fields": fields, "typecast": True}).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(DEALS_TABLE)}",
            data=body, method="POST",
            headers={"Authorization": f"Bearer {AIRTABLE_TOKEN}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req):
            pass
        created += 1
    print(f"Created {created} new candidates in '{DEALS_TABLE}' -- review as usual (Select: Approved/reject, confirm status), "
          f"then run sync_weekly_deals.py -- original_price will auto-fill from the same reference data once synced.")


def dedupe_across_zones(all_matches):
    """Collapses (chain_name, normalized item_name, price) duplicates
    across zones -- same convention as sync_weekly_deals.py's own
    zone-dedup (whitespace-collapsed, case-folded name). Keeps the
    first-seen occurrence; the specific zone it came from doesn't
    matter for what gets created, since curated_deals has no zone
    column and deal visibility is chain-only (see this file's module
    docstring)."""
    best_by_key = {}
    for m in all_matches:
        norm_name = re.sub(r"\s+", " ", m["item_name"]).strip().casefold()
        key = (m["chain_name"], norm_name, m["price"])
        if key not in best_by_key:
            best_by_key[key] = m
    return list(best_by_key.values())


def fetch_existing_deal_keys():
    """(chain_name, normalized item_name, price) already sitting in the
    Airtable "Deals" table -- guards against re-creating the same
    candidate twice (e.g. a zone already scanned+created individually
    before a later --week-dir run covers it again)."""
    records = []
    offset = None
    while True:
        url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(DEALS_TABLE)}?pageSize=100"
        if offset:
            url += f"&offset={offset}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AIRTABLE_TOKEN}"})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        records.extend(data["records"])
        offset = data.get("offset")
        if not offset:
            break
    keys = set()
    for r in records:
        f = r["fields"]
        if not f.get("chain_name") or not f.get("item_name") or f.get("price") is None:
            continue
        norm_name = re.sub(r"\s+", " ", f["item_name"]).strip().casefold()
        keys.add((f["chain_name"], norm_name, f["price"]))
    return keys


def run_week_dir(week_dir, create):
    zone_dirs = sorted(
        d for d in os.listdir(week_dir)
        if os.path.isdir(os.path.join(week_dir, d)) and os.path.exists(os.path.join(week_dir, d, "flyer.json"))
    )
    if not zone_dirs:
        sys.exit(f"No zone folders with flyer.json found under {week_dir}")

    tiers = fetch_reference_tiers()
    all_matches = []
    for zone_dir in zone_dirs:
        slug = zone_dir.split("--")[0]
        chain_name = CHAIN_NAME_MAP.get(slug)
        if not chain_name:
            print(f"  skipping {zone_dir!r}: unknown chain slug {slug!r} (add it to CHAIN_NAME_MAP)")
            continue
        matches = scan_zone(os.path.join(week_dir, zone_dir, "flyer.json"), chain_name, tiers)
        for m in matches:
            m["zone"] = zone_dir
        print(f"  {zone_dir} ({chain_name}): {len(matches)} matches")
        all_matches.extend(matches)

    deduped = dedupe_across_zones(all_matches)
    dropped = len(all_matches) - len(deduped)
    print(f"\n{len(all_matches)} total matches across {len(zone_dirs)} zones, "
          f"{dropped} cross-zone duplicates collapsed (same chain+item+price), {len(deduped)} unique candidates remain.")

    existing_keys = fetch_existing_deal_keys()
    new_only = []
    already_exists = 0
    for m in deduped:
        norm_name = re.sub(r"\s+", " ", m["item_name"]).strip().casefold()
        if (m["chain_name"], norm_name, m["price"]) in existing_keys:
            already_exists += 1
            continue
        new_only.append(m)
    if already_exists:
        print(f"{already_exists} already exist in '{DEALS_TABLE}' (e.g. from an earlier single-zone run) -- skipped, not re-created.")

    print_matches(new_only, "unique genuine reference-backed bargains, not already in Airtable")

    if not create:
        print("\nDry run only -- pass --create to push these as new Airtable 'Deals' candidates (Select: Pending).")
        return
    print(f"\nCreating {len(new_only)} deduped Airtable 'Deals' candidates...")
    create_candidates(new_only)


def main():
    args = sys.argv[1:]
    create = "--create" in args
    args = [a for a in args if a != "--create"]

    if "--week-dir" in args:
        idx = args.index("--week-dir")
        if idx + 1 >= len(args):
            sys.exit(__doc__)
        run_week_dir(args[idx + 1], create)
        return

    if len(args) != 2:
        sys.exit(__doc__)
    flyer_path, chain_name = args
    print(f"scanning {flyer_path}")
    tiers = fetch_reference_tiers()
    matches = scan_zone(flyer_path, chain_name, tiers)
    print_matches(matches, "genuine reference-backed bargains found (flat price, no flyer discount badge, but priced below the trusted reference)")
    if not create:
        print("\nDry run only -- pass --create to push these as new Airtable 'Deals' candidates (Select: Pending).")
        return
    print(f"\nCreating {len(matches)} Airtable 'Deals' candidates...")
    create_candidates(matches)


if __name__ == "__main__":
    main()
