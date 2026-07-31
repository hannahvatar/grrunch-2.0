"""Scans this week's raw flyer downloads (from the local Grrunch Thursday
fetch -- fetch_week.py, run by hand from
~/Desktop/Grrunch/Database/Weekly/) for PRODUCE items advertised with a
sale price but no stated regular price at all -- e.g. "Blueberries Pint"
at $1.97 with nothing to compare it to. That's a real, separate gap from
the main Airtable "Deals" review pipeline: the pipeline's own candidate
filter requires a real discount value to consider something a deal
candidate at all, so price-only items -- common for produce -- never
even reach Airtable's Deals table today.

For each one found: StatCan is checked first and used to auto-fill +
resolve the row immediately when it has a match; otherwise the row is
left blank in "Produce Reference Gaps" for a human to fill in by hand
(e.g. via grocerytracker.ca).

Usage:
    cd scripts && cp .env.example .env   # fill in AIRTABLE_TOKEN,
                                          # SUPABASE_SERVICE_ROLE_KEY once
    python3 scan_produce_flyers.py

Produce detection is a plain keyword match on the item name (see
PRODUCE_KEYWORDS/DISH_EXCLUDE_KEYWORDS below) -- not perfect, occasional
false positives (a dish that happens to name a vegetable, e.g. "Broccoli
Carbonara") may slip through as an extra row. Low-cost failure: it just
shows up in the Gaps table for you to notice and delete, nothing else
depends on it being exactly right.
"""

import csv
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


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


AIRTABLE_TOKEN = env("AIRTABLE_TOKEN")
AIRTABLE_BASE_ID = env("AIRTABLE_BASE_ID")
SUPABASE_URL = env("SUPABASE_URL")
SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY")

GAPS_TABLE = "Produce Reference Gaps"

# Same directory fetch_week.py writes into, one dated folder per week.
FLYERS_DIR = Path(env(
    "FLYERS_DIR",
    str(Path.home() / "Desktop" / "Grrunch" / "Database" / "Weekly" / "grrunch_flyers"),
))

STOPWORDS = {"with", "from", "each", "selected", "variety", "varieties", "fresh", "frozen"}


def normalize_words(text):
    words = re.split(r"[^a-z0-9]+", (text or "").lower())
    return [w for w in words if len(w) > 3 and w not in STOPWORDS]


def tokenize(name):
    """Whole-word tokens only, no length filter and no stopword removal
    (unlike normalize_words above) -- produce names include legitimately
    short words (pea, fig, yam) that a length filter would drop, and
    exact-word matching (rather than substring) is what keeps this from
    firing on coincidental letter sequences inside unrelated words --
    "massagers" contains "sage", "peanut" contains "pea", "popcorn"
    contains "corn", none of which are real matches."""
    return re.split(r"[^a-z0-9]+", (name or "").lower())


# Exact-word matches only (see tokenize) -- plurals are listed explicitly
# rather than relying on stemming, to avoid the substring collisions above.
PRODUCE_KEYWORDS = {
    "broccoli", "cauliflower", "carrot", "carrots", "potato", "potatoes",
    "onion", "onions", "garlic", "pepper", "peppers", "tomato", "tomatoes",
    "cucumber", "cucumbers", "lettuce", "spinach", "kale", "cabbage",
    "zucchini", "squash", "corn", "bean", "beans", "pea", "peas",
    "mushroom", "mushrooms", "celery", "radish", "radishes", "beet",
    "beets", "turnip", "turnips", "parsnip", "parsnips", "leek", "leeks",
    "asparagus", "artichoke", "artichokes", "eggplant", "yam", "yams",
    "arugula", "chard", "choy", "okra", "fennel", "endive", "watercress",
    "rutabaga", "sprout", "sprouts", "plantain", "plantains", "chayote",
    "apple", "apples", "banana", "bananas", "orange", "oranges",
    "blueberry", "blueberries", "strawberry", "strawberries", "watermelon",
    "watermelons", "grape", "grapes", "mango", "mangoes", "mangos",
    "pear", "pears", "peach", "peaches", "plum", "plums", "kiwi",
    "melon", "melons", "cantaloupe", "honeydew", "pineapple", "avocado",
    "avocados", "lemon", "lemons", "lime", "limes", "cherry", "cherries",
    "raspberry", "raspberries", "blackberry", "blackberries", "nectarine",
    "nectarines", "apricot", "apricots", "fig", "figs", "pomegranate",
    "clementine", "clementines", "mandarin", "mandarins", "tangerine",
    "tangerines", "grapefruit", "grapefruits", "cranberry", "cranberries",
    "currant", "currants",
    "cilantro", "parsley", "basil", "mint", "dill", "thyme", "rosemary",
    "chive", "chives", "sage",
}

# Exact-word exclusions -- items that name a produce word as one
# ingredient among several in a processed/prepared item, brand, or
# unrelated product, not the produce itself.
DISH_EXCLUDE_KEYWORDS = {
    "pasta", "sauce", "soup", "dinner", "meal", "shells", "casserole",
    "pizza", "kit", "chips", "crisps", "crackers", "cereal", "flakes",
    "cookie", "juice", "kombucha", "beverage", "drink", "soda", "pop",
    "cocktail", "clamato", "yogurt", "yoghurt", "salsa", "dip", "hummus",
    "wrap", "sandwich", "burger", "granola", "candy", "chocolate",
    "syrup", "jam", "jelly", "sausage", "pepperettes", "chicken", "beef",
    "pork", "fish", "salmon", "shrimp", "cheese", "milk", "cream",
    "butter", "alfredo", "carbonara", "fettuccini", "fettuccine", "rice",
    "noodle", "smoothie", "bar", "cake", "muffin", "pie", "bread",
    "toast", "focaccia", "buns", "bun", "orzo", "salad", "ham", "bacon",
    "gum", "mints", "lipstick", "gloss", "mascara", "massager",
    "massagers", "vibrating", "sunscreen", "iphone", "action", "figure",
    "tea", "lemonade", "popcorn", "nutella", "peanut", "peanuts",
    "ketchup", "pickle", "pickles", "coffee", "waffle", "cones",
    "topping", "flour", "beer", "eggs", "popsicle", "freezies",
    "humm", "cheesecake", "cheesecakes", "szechuan", "ridgies", "baked",
    "heinz", "ml", "yop",
}


def is_price_only_produce(name):
    tokens = set(tokenize(name))
    if not (tokens & PRODUCE_KEYWORDS):
        return False
    if tokens & DISH_EXCLUDE_KEYWORDS:
        return False
    return True


def latest_week_dir():
    weeks = sorted((d for d in FLYERS_DIR.iterdir() if d.is_dir()), reverse=True)
    if not weeks:
        raise SystemExit(f"No week folders found in {FLYERS_DIR}")
    return weeks[0]


def _slug(s):
    """Identical to fetch_week.py's own slug() -- each part is slugged
    separately, THEN joined with a literal "--", which is NOT the same as
    slugging the already-joined string (that collapses the "--" separator
    itself down to a single dash and no longer matches the real folder name)."""
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load_manifest_chains(week_dir):
    """zone folder name -> chain name, read from manifest.csv rather than
    re-deriving the slug, so it always matches whatever fetch_week.py
    actually named the folder."""
    manifest_path = week_dir / "manifest.csv"
    chain_by_slug = {}
    with open(manifest_path, newline="") as fh:
        for row in csv.DictReader(fh):
            zone_slug = f"{_slug(row['chain'])}--{_slug(row['zone_city'])}"
            chain_by_slug[zone_slug] = row["chain"]
    return chain_by_slug


def find_price_only_produce(week_dir, chain_by_slug):
    today = date.today().isoformat()
    candidates = []
    for zone_dir in sorted(d for d in week_dir.iterdir() if d.is_dir()):
        items_csv = zone_dir / "items.csv"
        if not items_csv.exists():
            continue
        chain = chain_by_slug.get(zone_dir.name, zone_dir.name)
        with open(items_csv, newline="") as fh:
            for row in csv.DictReader(fh):
                name = (row.get("name") or "").strip()
                if not name or not row.get("price"):
                    continue
                if row.get("original_price") or row.get("discount_flag"):
                    continue  # has a real regular-price comparison already
                if row.get("valid_to") and row["valid_to"] < today:
                    continue  # stale/expired flyer data lingering from last fetch
                if not is_price_only_produce(name):
                    continue
                candidates.append({
                    "item_name": name,
                    "chain_name": chain,
                    "price": float(row["price"]),
                    "flyer_valid_from": row.get("valid_from") or None,
                })
    return candidates


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
    """Same word-subset rule used in sync_weekly_deals.py -- most-specific
    (most words) match wins, and a StatCan name that collapses to a
    single generic word once "fresh"/"frozen" is stripped (e.g. "Frozen
    corn" -> "corn") is rejected, since it'd otherwise match any
    ingredient containing that word, fresh or not."""
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


def main():
    week_dir = latest_week_dir()
    print(f"Scanning {week_dir}")
    chain_by_slug = load_manifest_chains(week_dir)

    candidates = find_price_only_produce(week_dir, chain_by_slug)
    print(f"{len(candidates)} price-only produce candidates found across all zones")
    if not candidates:
        return

    statcan_rows = fetch_statcan_prices()
    already_covered = set(supabase_get_column("produce_reference_prices", "ingredient_name"))
    existing_gaps = fetch_airtable_table(GAPS_TABLE)
    flagged_names = {g["fields"].get("Item Name") for g in existing_gaps}

    new_gaps = 0
    auto_resolved = 0
    for deal in candidates:
        if deal["item_name"] in flagged_names or deal["item_name"] in already_covered:
            continue

        fields = {
            "Item Name": deal["item_name"],
            "Chain": deal["chain_name"],
            "Price": deal["price"],
            "Week Flagged": deal["flyer_valid_from"],
        }

        statcan_match = match_statcan_price(deal["item_name"], statcan_rows)
        if statcan_match:
            fields["Reference Price"] = statcan_match["avg_price"]
            fields["Unit"] = statcan_match["unit"]
            fields["Reference Date"] = statcan_match["reference_month"]
            fields["Resolved"] = True
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

    print(f"flagged {new_gaps} new price-only produce gaps ({auto_resolved} auto-resolved via StatCan)")


if __name__ == "__main__":
    main()
