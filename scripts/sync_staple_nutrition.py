"""Companion to sync_deal_nutrition.py, for the OTHER half of a recipe's
ingredients: generic staples (rice, garlic, oil, etc.) that aren't
deal-tagged and so were never in scope of that script. Looks up real
calorie/protein data for the staple ingredients the app's recipes
actually use, and syncs it back into whichever pricing table already
matches that ingredient (staple_reference_prices for most; a couple
-- e.g. Onions -- only resolve via statcan_reference_prices, so their
nutrition lives there instead; see 20260807010000_statcan_reference_
nutrition.sql for why). Nothing in the app reads these columns yet --
see sync_deal_nutrition.py's docstring for what Phase 2 (actually
wiring this into scaleMealToTargets) still requires.

Only syncs ingredient names actually used by a real recipe (same scope
discipline as sync_deal_nutrition.py, which only syncs deal items
tagged on real recipes) -- staple_reference_prices holds ~166 rows for
ingredients that don't appear in any current recipe yet, and looking
those up would burn USDA's already-tight DEMO_KEY quota on data nobody
needs.

USDA FoodData Central only -- staples are generic ingredients, not
branded products, so there's no barcode/label for Open Food Facts to
match against the way there is for a deal item. Uses the public
DEMO_KEY by default (rate-limited, and shared across everyone who
hasn't set their own key -- expect 429s); set USDA_API_KEY in .env for
real volume -- free self-serve signup at https://api.data.gov/signup.

Matching is the same word-overlap heuristic as sync_deal_nutrition.py
(and refresh_recipe_deal_tags, lib/staplePrices.ts) -- and just as
unreliable on its own. Every row this script writes has
nutrition_reviewed_by left null -- a human has to check the value
against a real source before anything is allowed to trust it, same
policy as deal_item_nutrition_reference.reviewed_by.

Usage:
    cd scripts && cp .env.example .env  # fill in SUPABASE_SERVICE_ROLE_KEY,
                                          # optionally USDA_API_KEY, AIRTABLE_TOKEN
    python3 sync_staple_nutrition.py

Re-run periodically as new staples show up -- already-synced ingredient
names are skipped, so this is cheap to run often.
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

REVIEW_TABLE = "Staple Nutrition Review"

# staple_reference_prices is checked first (it's where most staples'
# pricing already lives); statcan_reference_prices is the fallback for
# the few staples (e.g. Onions) that only resolve there. Order matters:
# an ingredient present in both would be ambiguous, but none currently
# are.
NUTRITION_TABLES = ["staple_reference_prices", "statcan_reference_prices"]

# Mirrors normalize_words() in sync_deal_nutrition.py / refresh_recipe_deal_tags
# (Postgres) / lib/staplePrices.ts -- same rule everywhere.
STOPWORDS = {"with", "from", "each", "selected", "variety", "varieties", "fresh", "frozen"}


def normalize_words(text):
    words = re.split(r"[^a-z0-9]+", (text or "").lower())
    return [w for w in words if len(w) > 3 and w not in STOPWORDS]


def word_overlap_score(item_name, candidate_name):
    item_words = set(normalize_words(item_name))
    if not item_words:
        return 0.0
    cand_words = set(normalize_words(candidate_name))
    return len(item_words & cand_words) / len(item_words)


# Same threshold as sync_deal_nutrition.py, for the same reason -- low
# enough that harmless filler doesn't sink a real match, high enough
# that an unrelated food doesn't get accepted.
MATCH_THRESHOLD = 0.4


class RateLimited(Exception):
    """USDA's DEMO_KEY quota is exhausted -- distinct from a genuine
    no-match, so callers can stop instead of mislabeling every
    remaining item as 'no confident match' and pushing bogus blank
    rows to the review queue."""


def http_get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def supabase_headers():
    return {"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}


def fetch_target_staple_names():
    """Every non-deal-tagged ingredient name used by a real recipe --
    the actual sync scope, not staple_reference_prices' full ~166-row
    reference list."""
    recipes = http_get_json(
        f"{SUPABASE_URL}/rest/v1/recipes?select=ingredients", headers=supabase_headers()
    )
    deal_names = {
        row["item_name"]
        for row in http_get_json(
            f"{SUPABASE_URL}/rest/v1/deal_item_nutrition_reference?select=item_name",
            headers=supabase_headers(),
        )
    }
    names = set()
    for recipe in recipes:
        for ingredient in recipe.get("ingredients") or []:
            name = ingredient.get("name")
            if name and name not in deal_names:
                names.add(name)
    return sorted(names)


def locate_table(ingredient_name):
    """Which of NUTRITION_TABLES already has a row for this ingredient
    (checked in priority order). None if it's in neither -- e.g. "Salt
    and pepper", whose quantity is "to taste" and isn't in any price
    table either."""
    for table in NUTRITION_TABLES:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=ingredient_name&ingredient_name=eq.{urllib.parse.quote(ingredient_name)}&limit=1"
        rows = http_get_json(url, headers=supabase_headers())
        if rows:
            return table
    return None


def fetch_synced_names(table):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=ingredient_name&calories_per_100g=not.is.null"
    rows = http_get_json(url, headers=supabase_headers())
    return {row["ingredient_name"] for row in rows}


def search_usda(item_name, min_score=MATCH_THRESHOLD, max_retries=4):
    """min_score=0 returns the best candidate regardless of confidence --
    used for manual-review rows, same as sync_deal_nutrition.py.
    Retries with backoff on 429 (DEMO_KEY is heavily shared and gets
    rate-limited easily); raises RateLimited if still failing after
    retries so the caller doesn't mistake "API unavailable" for
    "genuinely no match"."""
    url = (
        "https://api.nal.usda.gov/fdc/v1/foods/search?"
        + urllib.parse.urlencode({"query": item_name, "api_key": USDA_API_KEY, "pageSize": 5})
    )
    data = None
    for attempt in range(max_retries):
        try:
            data = http_get_json(url)
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                if attempt == max_retries - 1:
                    raise RateLimited(
                        f"USDA API still rate-limited after {max_retries} retries "
                        f"(key: {'DEMO_KEY' if USDA_API_KEY == 'DEMO_KEY' else 'custom'}). "
                        "Set USDA_API_KEY in scripts/.env (free at https://api.data.gov/signup) "
                        "or wait and re-run."
                    )
                time.sleep(2 ** (attempt + 2))  # 4s, 8s, 16s, 32s
                continue
            return None
        except (urllib.error.URLError, json.JSONDecodeError):
            return None
    if data is None:
        return None

    best = None
    best_score = 0.0
    for food in data.get("foods", []):
        description = food.get("description") or ""
        # Same "raw"/generic-preferring bonus as sync_deal_nutrition.py --
        # a staple like "Garlic" should resolve to the plain raw
        # ingredient, not some branded prepared product mentioning it.
        score = word_overlap_score(item_name, description)
        if re.search(r"\braw\b", description.lower()):
            score += 0.05
        nutrients = food.get("foodNutrients") or []
        kcal = next((n["value"] for n in nutrients if n.get("nutrientName") == "Energy"), None)
        protein = next((n["value"] for n in nutrients if n.get("nutrientName") == "Protein"), None)
        if score > best_score and kcal is not None and protein is not None:
            best_score = score
            best = {
                "calories_per_100g": round(float(kcal), 2),
                "protein_per_100g": round(float(protein), 2),
                "score": round(best_score, 2),
                "matched_name": description,
            }
    return best if best_score >= min_score else None


NUTRITION_COLUMNS = {"calories_per_100g", "protein_per_100g", "nutrition_source", "nutrition_reviewed_by"}


def update_ingredient(table, ingredient_name, fields):
    fields = {k: v for k, v in fields.items() if k in NUTRITION_COLUMNS}
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?ingredient_name=eq.{urllib.parse.quote(ingredient_name)}",
        data=json.dumps(fields).encode("utf-8"), method="PATCH",
        headers={**supabase_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


def fetch_unreviewed_rows(table):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=ingredient_name&nutrition_reviewed_by=is.null&calories_per_100g=not.is.null"
    return http_get_json(url, headers=supabase_headers())


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


def push_review_queue(name_to_table):
    existing = fetch_airtable_table(REVIEW_TABLE)
    already_pushed = {r["fields"].get("Ingredient Name") for r in existing}

    pushed = 0
    total_unreviewed = 0
    for table in NUTRITION_TABLES:
        for row in fetch_unreviewed_rows(table):
            total_unreviewed += 1
            name = row["ingredient_name"]
            if name in already_pushed:
                continue
            airtable_create_record(REVIEW_TABLE, {
                "Ingredient Name": name,
                "Status": "Pending",
                "Resolved": False,
            })
            already_pushed.add(name)
            pushed += 1
    print(f'pushed {pushed} new rows to "{REVIEW_TABLE}" for review ({total_unreviewed - pushed} already queued)')


def push_manual_review_rows(ingredient_names):
    existing = fetch_airtable_table(REVIEW_TABLE)
    already_pushed = {r["fields"].get("Ingredient Name") for r in existing}

    pushed = 0
    for name in ingredient_names:
        if name in already_pushed:
            continue
        airtable_create_record(REVIEW_TABLE, {
            "Ingredient Name": name,
            "Status": "Pending",
            "Resolved": False,
        })
        already_pushed.add(name)
        pushed += 1
    print(f'pushed {pushed} blank rows to "{REVIEW_TABLE}" for manual lookup ({len(ingredient_names) - pushed} already queued)')


def pull_reviewed(name_to_table):
    rows = fetch_airtable_table(REVIEW_TABLE)
    resolved = 0
    for r in rows:
        f = r["fields"]
        if f.get("Status") != "Approved" or f.get("Resolved"):
            continue
        if f.get("Calories per 100g") is None or f.get("Protein per 100g") is None:
            continue

        name = f["Ingredient Name"]
        table = name_to_table.get(name) or locate_table(name)
        if table is None:
            print(f'  skipping "{name}": not found in any nutrition table (typo?)')
            continue

        update_ingredient(table, name, {
            "calories_per_100g": f["Calories per 100g"],
            "protein_per_100g": f["Protein per 100g"],
            "nutrition_source": f.get("Source") or "manual",
            "nutrition_reviewed_by": f.get("Approved By") or "airtable_unspecified",
        })
        airtable_patch_record(REVIEW_TABLE, r["id"], {"Resolved": True})
        resolved += 1
    print(f"pulled {resolved} approved reviews back into their nutrition tables")


if __name__ == "__main__":
    print("Deriving target staple list from real recipes...")
    target_names = fetch_target_staple_names()
    print(f"{len(target_names)} staple ingredient names in use: {', '.join(target_names)}")

    name_to_table = {}
    unresolvable = []
    for name in target_names:
        table = locate_table(name)
        if table is None:
            unresolvable.append(name)
        else:
            name_to_table[name] = table
    if unresolvable:
        print(f"  not in any price table (skipping, unscalable/no unit): {', '.join(unresolvable)}")

    already_synced = set()
    for table in NUTRITION_TABLES:
        already_synced |= fetch_synced_names(table)
    pending = [name for name in name_to_table if name not in already_synced]
    print(f"{len(pending)} not yet synced.")

    matched, unmatched = [], []
    rate_limited = False
    for name in pending:
        try:
            result = search_usda(name)
        except RateLimited as e:
            print(f"\nStopping: {e}")
            rate_limited = True
            break
        if result is None:
            unmatched.append(name)
            print(f"  no confident match: {name}")
            continue
        update_ingredient(name_to_table[name], name, {**result, "nutrition_source": "usda"})
        matched.append(name)
        print(f"  usda ({name_to_table[name]}): {name} -> {result['calories_per_100g']} kcal/100g, {result['protein_per_100g']}g protein/100g")
        time.sleep(0.5)

    print(f"\nSynced {len(matched)} staples. {len(unmatched)} left unmatched:")
    for name in unmatched:
        print(f"  - {name}")

    print("\nPulling back any previously-approved reviews...")
    pull_reviewed(name_to_table)

    print(f'Pushing unreviewed rows to "{REVIEW_TABLE}" for human review...')
    push_review_queue(name_to_table)
    if unmatched:
        print(f"Pushing {len(unmatched)} unmatched staples as blank rows for manual lookup...")
        push_manual_review_rows(unmatched)
    print(
        f'Review at your Airtable base -> "{REVIEW_TABLE}": correct '
        "Calories/Protein per 100g if the match looks wrong, then set Status to "
        "Approved and fill in Approved By. Next run pulls approved rows back in."
    )
    if rate_limited:
        raise SystemExit(1)
