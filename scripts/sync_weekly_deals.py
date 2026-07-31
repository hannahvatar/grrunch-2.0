"""Weekly deal sync: Airtable (reviewed, approved deals) -> Supabase
curated_deals, then recompute every recipe's deal_tags against the fresh
data. Run this after finishing the week's Airtable review.

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

def env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise SystemExit(f"Missing required env var: {name} (see .env.example)")
    return value

AIRTABLE_TOKEN = env("AIRTABLE_TOKEN")
AIRTABLE_BASE_ID = env("AIRTABLE_BASE_ID")
SUPABASE_URL = env("SUPABASE_URL")
SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY")


def fetch_airtable_records():
    records = []
    offset = None
    while True:
        url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/Deals?pageSize=100"
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
    sync_curated_deals(records)
    refresh_deal_tags()
    print("Done -- curated_deals and every recipe's deal_tags now reflect this week's approved deals.")
