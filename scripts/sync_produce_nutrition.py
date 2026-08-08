"""Companion to sync_staple_nutrition.py, for the one generic-ingredient
price tier that script doesn't cover: produce_reference_prices, the
3rd-tier price fallback for produce that isn't currently deal-tagged
(see refresh_recipe_deal_tags' statcan -> produce -> staple order).
Looks up real calorie/protein data for produce ingredient names the
app's recipes actually use, syncing it back into produce_reference_
prices -- exactly the gap flagged in the 2026-08-08 table audit: a
produce ingredient currently gets real nutrition only while it happens
to also be deal-tagged (via sync_deal_nutrition.py's
deal_item_nutrition_reference); the moment that deal rotates off the
flyer, its nutrition contribution silently drops to zero with no
review queue to recover it. See 20260808020000_produce_reference_
nutrition.sql for the schema/matching side of this fix.

Only syncs ingredient names actually used by a real recipe (same scope
discipline as sync_staple_nutrition.py) -- produce_reference_prices
holds ~40 rows, most for produce no current recipe uses, and looking
those up would burn USDA's already-tight DEMO_KEY quota on data
nobody needs yet.

USDA FoodData Central only -- produce is generic, not branded, same
reasoning as sync_staple_nutrition.py. Uses the public DEMO_KEY by
default (rate-limited); set USDA_API_KEY in .env for real volume --
free self-serve signup at https://api.data.gov/signup.

Matching is the same word-overlap heuristic as sync_staple_nutrition.py
(and refresh_recipe_deal_tags, lib/staplePrices.ts) -- and just as
unreliable on its own. Every row this script writes has
nutrition_reviewed_by left null -- a human has to check the value
against a real source before anything is allowed to trust it, same
policy as the other two nutrition tables.

Usage:
    cd scripts && cp .env.example .env  # fill in SUPABASE_SERVICE_ROLE_KEY,
                                          # optionally USDA_API_KEY, AIRTABLE_TOKEN
    python3 sync_produce_nutrition.py

Re-run periodically as new produce ingredients show up in recipes --
already-synced ingredient names are skipped, so this is cheap to run
often.
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

REVIEW_TABLE = "Produce Nutrition Review"

# Just the one table -- unlike sync_staple_nutrition.py's two-tier
# fallback (staple_reference_prices then statcan_reference_prices),
# produce ingredient names that don't resolve here aren't in scope of
# this script (they're either deal-tagged, already covered by
# sync_deal_nutrition.py, or a staple, covered by
# sync_staple_nutrition.py).
NUTRITION_TABLE = "produce_reference_prices"

# Mirrors normalize_words() in sync_staple_nutrition.py / refresh_recipe_deal_tags
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


# Same threshold as sync_staple_nutrition.py, for the same reason -- low
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


def fetch_target_produce_names():
    """Every ingredient name used by a real recipe that (a) isn't
    covered by a deal_item_nutrition_reference match already and (b)
    resolves against produce_reference_prices specifically -- the
    actual sync scope, not produce_reference_prices' full ~40-row
    reference list, and not staple/statcan-matched names either
    (those are sync_staple_nutrition.py's job)."""
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
    deal_words = [set(normalize_words(n)) for n in deal_names]

    def already_deal_covered(name):
        ing_words = set(normalize_words(name))
        return any(dw and dw <= ing_words for dw in deal_words)

    produce_rows = http_get_json(
        f"{SUPABASE_URL}/rest/v1/{NUTRITION_TABLE}?select=ingredient_name",
        headers=supabase_headers(),
    )
    produce_words = [(row["ingredient_name"], set(normalize_words(row["ingredient_name"]))) for row in produce_rows]

    def resolves_to_produce(name):
        ing_words = set(normalize_words(name))
        return any(pw and pw <= ing_words for _, pw in produce_words)

    names = set()
    for recipe in recipes:
        for ingredient in recipe.get("ingredients") or []:
            name = ingredient.get("name")
            if not name or already_deal_covered(name):
                continue
            if resolves_to_produce(name):
                names.add(name)
    return sorted(names)


def fetch_synced_names():
    url = f"{SUPABASE_URL}/rest/v1/{NUTRITION_TABLE}?select=ingredient_name&calories_per_100g=not.is.null"
    rows = http_get_json(url, headers=supabase_headers())
    return {row["ingredient_name"] for row in rows}


def search_usda(item_name, min_score=MATCH_THRESHOLD, max_retries=4):
    """min_score=0 returns the best candidate regardless of confidence --
    used for manual-review rows, same as sync_staple_nutrition.py.
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
        # Same "raw"/generic-preferring bonus as sync_staple_nutrition.py --
        # produce like "Kale" should resolve to the plain raw ingredient,
        # not some branded prepared product mentioning it.
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


def update_ingredient(ingredient_name, fields):
    fields = {k: v for k, v in fields.items() if k in NUTRITION_COLUMNS}
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{NUTRITION_TABLE}?ingredient_name=eq.{urllib.parse.quote(ingredient_name)}",
        data=json.dumps(fields).encode("utf-8"), method="PATCH",
        headers={**supabase_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


def fetch_unreviewed_rows():
    url = f"{SUPABASE_URL}/rest/v1/{NUTRITION_TABLE}?select=ingredient_name,calories_per_100g,protein_per_100g,nutrition_source&nutrition_reviewed_by=is.null&calories_per_100g=not.is.null"
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


def push_review_queue():
    existing = fetch_airtable_table(REVIEW_TABLE)
    already_pushed = {r["fields"].get("Ingredient Name") for r in existing}

    pushed = 0
    total_unreviewed = 0
    for row in fetch_unreviewed_rows():
        total_unreviewed += 1
        name = row["ingredient_name"]
        if name in already_pushed:
            continue
        airtable_create_record(REVIEW_TABLE, {
            "Ingredient Name": name,
            "Source": row.get("nutrition_source") or "",
            "Calories per 100g": row["calories_per_100g"],
            "Protein per 100g": row["protein_per_100g"],
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


def pull_reviewed():
    rows = fetch_airtable_table(REVIEW_TABLE)
    resolved = 0
    for r in rows:
        f = r["fields"]
        if f.get("Status") != "Approved" or f.get("Resolved"):
            continue
        if f.get("Calories per 100g") is None or f.get("Protein per 100g") is None:
            continue

        name = f["Ingredient Name"]
        update_ingredient(name, {
            "calories_per_100g": f["Calories per 100g"],
            "protein_per_100g": f["Protein per 100g"],
            "nutrition_source": f.get("Source") or "manual",
            "nutrition_reviewed_by": f.get("Approved By") or "airtable_unspecified",
        })
        airtable_patch_record(REVIEW_TABLE, r["id"], {"Resolved": True})
        resolved += 1
    print(f"pulled {resolved} approved reviews back into produce_reference_prices")


if __name__ == "__main__":
    print("Deriving target produce list from real recipes...")
    target_names = fetch_target_produce_names()
    if target_names:
        print(f"{len(target_names)} produce ingredient names in use: {', '.join(target_names)}")
    else:
        print("0 produce ingredient names currently in use (every produce ingredient in today's "
              "recipes is deal-tagged, so it already gets nutrition via deal_item_nutrition_"
              "reference) -- nothing to sync yet, this just confirms the pipeline runs clean.")

    already_synced = fetch_synced_names()
    pending = [name for name in target_names if name not in already_synced]
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
        update_ingredient(name, {**result, "nutrition_source": "usda"})
        matched.append(name)
        print(f"  usda: {name} -> {result['calories_per_100g']} kcal/100g, {result['protein_per_100g']}g protein/100g")
        time.sleep(0.5)

    print(f"\nSynced {len(matched)} produce items. {len(unmatched)} left unmatched:")
    for name in unmatched:
        print(f"  - {name}")

    print("\nPulling back any previously-approved reviews...")
    pull_reviewed()

    print(f'Pushing unreviewed rows to "{REVIEW_TABLE}" for human review...')
    push_review_queue()
    if unmatched:
        print(f"Pushing {len(unmatched)} unmatched produce items as blank rows for manual lookup...")
        push_manual_review_rows(unmatched)
    print(
        f'Review at your Airtable base -> "{REVIEW_TABLE}": correct '
        "Calories/Protein per 100g if the match looks wrong, then set Status to "
        "Approved and fill in Approved By. Next run pulls approved rows back in."
    )
    if rate_limited:
        raise SystemExit(1)
