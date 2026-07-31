"""Syncs statcan_reference_prices from StatCan's free, open Web Data
Service -- table 18-10-0245-01 "Monthly average retail prices for
selected products", filtered to British Columbia and the most recent
month available. No API key needed.

Usage:
    cd scripts && cp .env.example .env  # fill in SUPABASE_SERVICE_ROLE_KEY once
    python3 sync_statcan_prices.py

Run this monthly (StatCan releases new data once a month, a few days
into the following month) -- there's no need to run it more often than
that, the underlying data doesn't change in between releases.
"""

import csv
import io
import json
import os
import urllib.request
import zipfile

PRODUCT_ID = 18100245
GEOGRAPHY = "British Columbia"

# StatCan's product list includes a handful of non-food household items
# (deodorant, shampoo, laundry detergent, etc.) that are out of scope for
# a grocery meal-planning app -- excluded rather than silently kept as
# clutter no recipe would ever match against.
EXCLUDED_PRODUCTS = {
    "Deodorant, 85 grams",
    "Toothpaste, 100 millilitres",
    "Shampoo, 400 millilitres",
    "Laundry detergent, 4.43 litres",
    "Baby food, 128 millilitres",
    "Infant formula, 900 grams",
}


def env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise SystemExit(f"Missing required env var: {name} (see .env.example)")
    return value


SUPABASE_URL = env("SUPABASE_URL")
SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY")


def get_csv_download_url():
    req = urllib.request.Request(
        "https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/"
        f"{PRODUCT_ID}/en"
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    if data.get("status") != "SUCCESS":
        raise SystemExit(f"StatCan API error: {data}")
    return data["object"]


def fetch_bc_rows():
    url = get_csv_download_url()
    with urllib.request.urlopen(url) as resp:
        zip_bytes = resp.read()
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        csv_name = next(n for n in zf.namelist() if n.endswith(".csv") and "MetaData" not in n)
        with zf.open(csv_name) as f:
            text = io.TextIOWrapper(f, encoding="utf-8-sig")
            rows = [row for row in csv.DictReader(text) if row["GEO"] == GEOGRAPHY]
    return rows


def latest_month_rows(rows):
    latest = max(row["REF_DATE"] for row in rows)
    return latest, [row for row in rows if row["REF_DATE"] == latest]


def to_reference_price(row, reference_month):
    product_name = row["Products"].strip()
    ingredient_name = product_name.split(",")[0].strip()
    # e.g. "Milk, 2 litres" -> unit "2 litres"; a handful of products
    # have no comma (e.g. "Tea (20 bags)") -- fall back to the full name.
    parts = product_name.split(",", 1)
    unit = parts[1].strip() if len(parts) > 1 else product_name
    return {
        "product_name": product_name,
        "ingredient_name": ingredient_name,
        "unit": unit,
        "avg_price": float(row["VALUE"]),
        "geography": GEOGRAPHY,
        "reference_month": f"{reference_month}-01",
        "source": "statcan",
    }


def upsert(rows):
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/statcan_reference_prices?on_conflict=product_name,geography",
        data=body, method="POST",
        headers={
            "apikey": SERVICE_ROLE,
            "Authorization": f"Bearer {SERVICE_ROLE}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


if __name__ == "__main__":
    print("Downloading StatCan table 18-10-0245-01...")
    rows = fetch_bc_rows()
    latest, latest_rows = latest_month_rows(rows)
    print(f"Latest month available: {latest} ({len(latest_rows)} products)")

    reference_prices = [
        to_reference_price(row, latest)
        for row in latest_rows
        if row["Products"].strip() not in EXCLUDED_PRODUCTS and row["VALUE"]
    ]
    print(f"Syncing {len(reference_prices)} food/grocery items (excluded {len(latest_rows) - len(reference_prices)} non-food items)...")

    status = upsert(reference_prices)
    print(f"Upsert status: {status}")
    print("Done.")
