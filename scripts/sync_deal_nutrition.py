"""Phase 1 of real ingredient-level nutrition (see mealScaling.ts's doc
comment for why calories/protein are currently a single static number per
recipe, not derived from ingredients): looks up real calorie/protein data
for every approved curated_deals item and syncs it into
deal_item_nutrition_reference. Nothing in the app reads that table yet --
this only gets the data; wiring it into scaleMealToTargets is a separate,
larger change (a second search dimension for adjustable staples, and
recipes.calories/protein becoming computed from ingredients like
recipes.price already is).

Two sources, tried in order:
  1. Open Food Facts (world.openfoodfacts.org) -- free, open, real
     nutrition labels for branded/packaged items. Good for prepared
     proteins, packaged sides, anything with a barcode.
  2. USDA FoodData Central (api.nal.usda.gov) -- free, generic/raw
     ingredient data. Fallback for loose produce and other unbranded
     items Open Food Facts doesn't carry. Uses the public DEMO_KEY by
     default (rate-limited); set USDA_API_KEY in .env for real volume --
     free self-serve signup at https://api.data.gov/signup.

Matching is a word-overlap heuristic (same normalize_words() rule as
refresh_recipe_deal_tags and lib/staplePrices.ts): an item is only
accepted if enough of its significant words show up in the candidate's
name. Anything neither source confidently matches is left unsynced and
printed at the end -- never a guessed number, same policy as
produce_reference_prices.

That heuristic isn't precise enough to trust on its own, though -- a real
first run matched "GREEN ONIONS" to a product reporting 590 kcal/100g
(real green onions: ~32) and "Small Bar Cakes" to something reporting 40g
protein/100g. Every row this script writes has reviewed_by left null
(see supabase/migrations/20260806010000_deal_item_nutrition_review_flag.sql)
-- a human has to check calories_per_100g/protein_per_100g against a real
source and set reviewed_by before any code is allowed to read the row,
same as staple_reference_prices.checked_by.

Usage:
    cd scripts && cp .env.example .env  # fill in SUPABASE_SERVICE_ROLE_KEY,
                                          # optionally USDA_API_KEY
    python3 sync_deal_nutrition.py

Re-run periodically as new curated_deals items show up -- already-synced
item_names are skipped, so this is cheap to run often.
"""

import json
import os
import re
import time
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


def env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise SystemExit(f"Missing required env var: {name} (see .env.example)")
    return value


SUPABASE_URL = env("SUPABASE_URL")
SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY")
USDA_API_KEY = os.environ.get("USDA_API_KEY", "DEMO_KEY")
AIRTABLE_TOKEN = env("AIRTABLE_TOKEN")
AIRTABLE_BASE_ID = env("AIRTABLE_BASE_ID")

REVIEW_TABLE = "Deal Nutrition Review"

# Mirrors normalize_words() in refresh_recipe_deal_tags (Postgres) and
# lib/staplePrices.ts -- same rule everywhere: lowercase, strip
# punctuation, drop short/generic words.
STOPWORDS = {"with", "from", "each", "selected", "variety", "varieties", "fresh", "frozen"}


def normalize_words(text):
    words = re.split(r"[^a-z0-9]+", (text or "").lower())
    return [w for w in words if len(w) > 3 and w not in STOPWORDS]


def word_overlap_score(item_name, candidate_name):
    """Fraction of item_name's significant words that appear in
    candidate_name. 0 if item_name has no significant words."""
    item_words = set(normalize_words(item_name))
    if not item_words:
        return 0.0
    cand_words = set(normalize_words(candidate_name))
    return len(item_words & cand_words) / len(item_words)

# A candidate must cover at least this fraction of the item's significant
# words to be trusted -- low enough that marketing filler ("naturally
# imperfect", "prime raised without antibiotics") doesn't sink a real
# match, high enough that an unrelated product doesn't get accepted.
MATCH_THRESHOLD = 0.4


def http_get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def fetch_deal_item_names():
    url = (
        f"{SUPABASE_URL}/rest/v1/curated_deals"
        "?status=eq.approved&select=item_name&order=item_name"
    )
    rows = http_get_json(
        url, headers={"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}
    )
    return sorted({row["item_name"] for row in rows if row.get("item_name")})


def fetch_already_synced_names():
    url = f"{SUPABASE_URL}/rest/v1/deal_item_nutrition_reference?select=item_name"
    rows = http_get_json(
        url, headers={"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}
    )
    return {row["item_name"] for row in rows}


def parse_off_quantity_grams(quantity_text):
    """Open Food Facts' `quantity` field is free text like "480g" or
    "1.2 kg" -- extracts a gram amount when it's parseable, None
    otherwise (rather than guessing)."""
    if not quantity_text:
        return None
    m = re.search(r"([\d.]+)\s*(kg|g)\b", quantity_text.lower())
    if not m:
        return None
    amount = float(m.group(1))
    return amount * 1000 if m.group(2) == "kg" else amount


# Open Food Facts always stores nutrition under "_100g"-suffixed field
# names, whether the product is actually measured by weight or volume --
# confirmed directly against the API (a 330ml Coca-Cola's
# "energy-kcal_100g" is 42.1, the real per-100ML figure, not a mistake).
# There's no separate "_100ml" field to check instead; the only reliable
# signal is the product's own category. Ready-to-drink liquid categories
# only -- "en:coffees" (instant coffee, a dry powder) is deliberately
# excluded, confirmed via the API that it carries no "beverages"/"sodas"/
# "waters" tag the way an actual bottled drink does.
LIQUID_CATEGORY_TAGS = {
    "en:beverages", "en:sodas", "en:waters", "en:fruit-juices",
    "en:carbonated-drinks", "en:iced-teas", "en:energy-drinks",
    "en:sweetened-beverages", "en:plant-milks", "en:milks",
}


def search_open_food_facts(item_name, min_score=MATCH_THRESHOLD):
    """min_score=0 returns the best candidate regardless of confidence --
    used for manual-review rows, where even a low-confidence guess's
    brand/barcode gives a human a head start (see push_manual_review_rows
    callers). Every returned dict carries its own "score" so callers can
    tell a confident match from a mere starting point."""
    url = (
        "https://world.openfoodfacts.org/cgi/search.pl?"
        + urllib.parse.urlencode({
            "search_terms": item_name,
            "search_simple": "1",
            "action": "process",
            "json": "1",
            "page_size": "5",
        })
    )
    try:
        data = http_get_json(url, headers={"User-Agent": "GrrunchApp/1.0 (nutrition sync)"})
    except (urllib.error.URLError, json.JSONDecodeError):
        return None

    best = None
    best_score = 0.0
    for product in data.get("products", []):
        name = product.get("product_name") or ""
        score = word_overlap_score(item_name, f"{name} {product.get('brands') or ''}")
        nutriments = product.get("nutriments") or {}
        kcal = nutriments.get("energy-kcal_100g")
        protein = nutriments.get("proteins_100g")
        if score > best_score and kcal is not None and protein is not None:
            best_score = score
            is_liquid = bool(LIQUID_CATEGORY_TAGS & set(product.get("categories_tags") or []))
            best = {
                "source": "openfoodfacts",
                "calories_per_100g": round(float(kcal), 2),
                "protein_per_100g": round(float(protein), 2),
                "package_grams": parse_off_quantity_grams(product.get("quantity")),
                "barcode": product.get("code"),
                "brand": product.get("brands"),
                "basis": "per_100ml" if is_liquid else "per_100g",
                "score": round(best_score, 2),
                "matched_name": name,
            }
    return best if best_score >= min_score else None


def search_usda(item_name, min_score=MATCH_THRESHOLD):
    """min_score=0 returns the best candidate regardless of confidence --
    see search_open_food_facts."""
    url = (
        "https://api.nal.usda.gov/fdc/v1/foods/search?"
        + urllib.parse.urlencode({"query": item_name, "api_key": USDA_API_KEY, "pageSize": 5})
    )
    try:
        data = http_get_json(url)
    except (urllib.error.URLError, json.JSONDecodeError):
        return None

    best = None
    best_score = 0.0
    for food in data.get("foods", []):
        description = food.get("description") or ""
        # Prefer plain/generic entries over heavily-processed or
        # branded-restatement ones when scores tie -- a small bonus for
        # "raw"/"uncooked" keeps e.g. "Peppers, sweet, green, raw" ahead
        # of "Peppers, sweet, pickled" for otherwise-equal overlap.
        score = word_overlap_score(item_name, description)
        if re.search(r"\braw\b", description.lower()):
            score += 0.05
        nutrients = food.get("foodNutrients") or []
        kcal = next((n["value"] for n in nutrients if n.get("nutrientName") == "Energy"), None)
        protein = next((n["value"] for n in nutrients if n.get("nutrientName") == "Protein"), None)
        if score > best_score and kcal is not None and protein is not None:
            best_score = score
            best = {
                "source": "usda",
                "calories_per_100g": round(float(kcal), 2),
                "protein_per_100g": round(float(protein), 2),
                "package_grams": None,
                "barcode": None,
                "brand": None,
                # USDA reports even liquids (milk, juice) per 100g of the
                # food as consumed, by its own convention -- never per
                # 100ml, unlike Open Food Facts' category-dependent basis.
                "basis": "per_100g",
                "score": round(best_score, 2),
                "matched_name": description,
            }
    return best if best_score >= min_score else None


# search_open_food_facts/search_usda's result dicts carry "score" and
# "matched_name" for callers that want them (e.g. manual-review rows
# showing a low-confidence candidate) -- neither is a real
# deal_item_nutrition_reference column, so upsert() strips anything not
# in this list rather than relying on every caller to remember to.
DEAL_NUTRITION_COLUMNS = {
    "item_name", "brand", "source", "calories_per_100g", "protein_per_100g",
    "package_grams", "barcode", "basis", "reviewed_by",
}


def upsert(rows):
    if not rows:
        return None
    rows = [{k: v for k, v in row.items() if k in DEAL_NUTRITION_COLUMNS} for row in rows]
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/deal_item_nutrition_reference?on_conflict=item_name",
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


def fetch_unreviewed_rows():
    url = f"{SUPABASE_URL}/rest/v1/deal_item_nutrition_reference?reviewed_by=is.null"
    return http_get_json(
        url, headers={"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}
    )


def fetch_airtable_table(table_name):
    records = []
    offset = None
    while True:
        url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(table_name)}?pageSize=100"
        if offset:
            url += f"&offset={offset}"
        data = http_get_json(url, headers={"Authorization": f"Bearer {AIRTABLE_TOKEN}"})
        records.extend(data["records"])
        offset = data.get("offset")
        if not offset:
            break
    return records


def airtable_create_record(table_name, fields):
    body = json.dumps({"fields": fields, "typecast": True}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(table_name)}",
        data=body, method="POST",
        headers={"Authorization": f"Bearer {AIRTABLE_TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req):
        pass


def airtable_patch_record(table_name, record_id, fields):
    body = json.dumps({"fields": fields}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{urllib.parse.quote(table_name)}/{record_id}",
        data=body, method="PATCH",
        headers={"Authorization": f"Bearer {AIRTABLE_TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req):
        pass


def push_review_queue():
    """Every unreviewed deal_item_nutrition_reference row (reviewed_by is
    null) gets a "Deal Nutrition Review" Airtable record with the
    auto-matched values pre-filled as a starting suggestion -- a human
    edits Calories/Protein per 100g in place if the match looks wrong
    (see the GREEN ONIONS/Small Bar Cakes examples in this file's
    docstring), then sets Status to Approved. Already-pushed items are
    skipped by Item Name so re-running this doesn't create duplicates."""
    unreviewed = fetch_unreviewed_rows()
    existing = fetch_airtable_table(REVIEW_TABLE)
    already_pushed = {r["fields"].get("Item Name") for r in existing}

    pushed = 0
    for row in unreviewed:
        if row["item_name"] in already_pushed:
            continue
        airtable_create_record(REVIEW_TABLE, {
            "Item Name": row["item_name"],
            "Brand": row.get("brand") or "",
            "Source": row["source"],
            "Product Match": f"{row.get('brand') or ''} (via {row['source']})".strip(),
            "Calories per 100g": row["calories_per_100g"],
            "Protein per 100g": row["protein_per_100g"],
            "Barcode": row.get("barcode") or "",
            "Basis": row.get("basis") or "per_100g",
            "Status": "Pending",
            "Resolved": False,
        })
        already_pushed.add(row["item_name"])
        pushed += 1
    print(f"pushed {pushed} new rows to \"{REVIEW_TABLE}\" for review ({len(unreviewed) - pushed} already queued)")


def push_manual_review_rows(item_names):
    """For items neither Open Food Facts nor USDA confidently matched --
    usually complex flyer marketing names like "PC® WHOLE CREMINI or
    WHITE MUSHROOMS, 454 G" -- pushes a blank "Deal Nutrition Review" row
    (Calories/Protein left empty) for a human to fill in by hand, same
    "leave the gap visible, never guess" policy as produce_reference_
    prices' own manual-entry rows. Skips names already queued (matched
    or manual) so this is safe to re-run."""
    existing = fetch_airtable_table(REVIEW_TABLE)
    already_pushed = {r["fields"].get("Item Name") for r in existing}

    pushed = 0
    for name in item_names:
        if name in already_pushed:
            continue
        airtable_create_record(REVIEW_TABLE, {
            "Item Name": name,
            "Product Match": "(no confident API match -- fill in by hand)",
            "Status": "Pending",
            "Resolved": False,
        })
        already_pushed.add(name)
        pushed += 1
    print(f"pushed {pushed} blank rows to \"{REVIEW_TABLE}\" for manual lookup ({len(item_names) - pushed} already queued)")


def pull_reviewed():
    """Pulls any "Deal Nutrition Review" row a human has set to Approved
    (using whatever Calories/Protein per 100g value is in the row at that
    point -- their edit if they corrected it, the original suggestion
    otherwise) back into deal_item_nutrition_reference, setting
    reviewed_by so the row becomes readable by future app code. Marks
    the Airtable row Resolved so it's not re-processed on the next run.

    Upserts rather than only updating: a row pushed blank for manual
    lookup (see push_manual_review_rows) has no matching Supabase row
    yet, so a plain PATCH-by-item_name would silently update zero rows
    once approved. Source defaults to 'manual' for exactly that case --
    an OFF/USDA match already has Source filled in from when it was
    pushed, but a from-scratch human entry never went through either
    API."""
    rows = fetch_airtable_table(REVIEW_TABLE)
    resolved = 0
    for r in rows:
        f = r["fields"]
        if f.get("Status") != "Approved" or f.get("Resolved"):
            continue
        if f.get("Calories per 100g") is None or f.get("Protein per 100g") is None:
            continue

        row = {
            "item_name": f["Item Name"],
            "brand": f.get("Brand") or None,
            "source": f.get("Source") or "manual",
            "calories_per_100g": f["Calories per 100g"],
            "protein_per_100g": f["Protein per 100g"],
            "barcode": f.get("Barcode") or None,
            "basis": f.get("Basis") or "per_100g",
            "reviewed_by": f.get("Approved By") or "airtable_unspecified",
        }
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/deal_item_nutrition_reference?on_conflict=item_name",
            data=json.dumps([row]).encode("utf-8"), method="POST",
            headers={
                "apikey": SERVICE_ROLE,
                "Authorization": f"Bearer {SERVICE_ROLE}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        with urllib.request.urlopen(req):
            pass

        airtable_patch_record(REVIEW_TABLE, r["id"], {"Resolved": True})
        resolved += 1
    print(f"pulled {resolved} approved reviews back into deal_item_nutrition_reference")


if __name__ == "__main__":
    print("Fetching approved curated_deals item names...")
    all_names = fetch_deal_item_names()
    already_synced = fetch_already_synced_names()
    pending = [name for name in all_names if name not in already_synced]
    print(f"{len(all_names)} distinct items, {len(pending)} not yet synced.")

    matched, unmatched = [], []
    for item_name in pending:
        result = search_open_food_facts(item_name)
        if result is None:
            result = search_usda(item_name)
        if result is None:
            unmatched.append(item_name)
            print(f"  no confident match: {item_name}")
            continue
        matched.append({"item_name": item_name, **result})
        print(f"  {result['source']}: {item_name} -> {result['calories_per_100g']} kcal/100g, {result['protein_per_100g']}g protein/100g")
        time.sleep(0.2)  # be polite to both free APIs

    status = upsert(matched)
    print(f"\nSynced {len(matched)} items (upsert status: {status}). {len(unmatched)} left unmatched:")
    for name in unmatched:
        print(f"  - {name}")

    print(f"\nPulling back any previously-approved reviews...")
    pull_reviewed()

    print(f"Pushing unreviewed rows to \"{REVIEW_TABLE}\" for human review...")
    push_review_queue()
    print(
        'Review at your Airtable base -> "Deal Nutrition Review": correct '
        "Calories/Protein per 100g if the match looks wrong, then set Status to "
        "Approved and fill in Approved By. Next run pulls approved rows back in."
    )
