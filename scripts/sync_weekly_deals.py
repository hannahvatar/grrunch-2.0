"""Weekly deal sync: Airtable (reviewed, approved deals) -> Supabase
curated_deals, then recompute every recipe's deal_tags against the fresh
data. Run this after finishing the week's Airtable review.

Also flags produce deals with no reference price anywhere (StatCan
doesn't track most produce, and we don't want AI-guessed prices mixed
with human-verified ones) into a second Airtable table, "Produce
Reference Gaps" -- and pulls back any gap rows a human has since filled
in, upserting them into Supabase produce_reference_prices. See
supabase/migrations/20260801000000_produce_reference_prices.sql.

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
    return rows


def supabase_get_column(table, column):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={column}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_ROLE,
        "Authorization": f"Bearer {SERVICE_ROLE}",
    })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return [row[column] for row in data]


def flag_produce_gaps(deal_rows):
    """Produce deals with no reference price anywhere yet get a row in the
    "Produce Reference Gaps" Airtable table, for a human to fill in the
    regular price by hand. Scoped to category containing "produce" so this
    stays small and doesn't try to cover every ingredient."""
    produce_deals = [r for r in deal_rows if "produce" in (r["category"] or "").lower()]
    if not produce_deals:
        print("no produce deals this week")
        return

    reference_names = (
        supabase_get_column("statcan_reference_prices", "ingredient_name")
        + supabase_get_column("produce_reference_prices", "ingredient_name")
    )
    reference_word_sets = [normalize_words(name) for name in reference_names]

    existing_gaps = fetch_airtable_table(GAPS_TABLE)
    flagged_names = {
        g["fields"].get("Item Name")
        for g in existing_gaps
        if not g["fields"].get("Resolved")
    }

    new_gaps = 0
    for deal in produce_deals:
        if deal["item_name"] in flagged_names:
            continue
        ing_words = normalize_words(deal["item_name"])
        has_reference = any(
            ref_words and all(w in ing_words for w in ref_words)
            for ref_words in reference_word_sets
        )
        if has_reference:
            continue

        body = json.dumps({"fields": {
            "Item Name": deal["item_name"],
            "Chain": deal["chain_name"],
            "Sale Price": deal["price"],
            "Original Price": deal.get("original_price"),
            "Week Flagged": deal.get("flyer_valid_from"),
            "Ingredient Name": deal["item_name"],
            "Resolved": False,
        }}).encode("utf-8")
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

    print(f"flagged {new_gaps} new produce reference gaps out of {len(produce_deals)} produce deals")


def resolve_produce_gaps():
    """Pulls any "Produce Reference Gaps" rows a human has since filled in
    (Reference Price + Unit both present) into produce_reference_prices,
    then marks them Resolved so they stop showing up in Airtable."""
    gaps = fetch_airtable_table(GAPS_TABLE)
    resolved = 0
    for g in gaps:
        f = g["fields"]
        if f.get("Resolved") or f.get("Reference Price") is None or not f.get("Unit") or not f.get("Reference Date"):
            continue

        row = {
            "ingredient_name": f.get("Ingredient Name") or f["Item Name"],
            "unit": f["Unit"],
            "avg_price": f["Reference Price"],
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

    print(f"resolved {resolved} produce reference gaps into produce_reference_prices")


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
    rows = sync_curated_deals(records)
    resolve_produce_gaps()  # pull in any prices filled in since last run first,
    flag_produce_gaps(rows)  # so this week's gap check sees them and skips re-flagging
    refresh_deal_tags()
    print("Done -- curated_deals and every recipe's deal_tags now reflect this week's approved deals.")
