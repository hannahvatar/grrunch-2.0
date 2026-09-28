"""Weekly flyer fetch -> Claude-picked deal candidates -> DRAFT week.

Replaces the old manual chain (Anabelle, 2026-09-24: "The process overall
is not clear or clean"): fetch_week.py double-clicked on a Mac, then an
undocumented AI step ("the 9 zone-review agents") filling Airtable's
"Deals" table, then sync_weekly_deals.py copying Airtable into
curated_deals. Now one scheduled job, no Airtable in the deals path:

  1. Fetch the UPCOMING weekly flyer (not the one valid today) for every
     zone in flyer_zones.csv from Flipp -- the same source fetch_week.py
     used; the chains' own website flyers are Flipp embeds.
  2. Claude picks the candidates in three passes (criteria: Anabelle,
     2026-09-24, after a first test kept ~150-280 per chain):
       a. text -- keeps grocery food only, cleans names, suggests
          category and recipes/deals usage, and flags whether each item
          is a good, versatile recipe ingredient in general;
       b. image -- reads EVERY food item's flyer cutout for what Flipp's
          data doesn't carry: the printed regular price / "save" badge,
          the unit (/lb, /kg, /100g, each), and multi-buys ("2 for $5");
       c. text -- the final pick, up to MAX_PER_CHAIN, each with its
          reason: "Saving on flyer", "Good recipe ingredient", or
          "AI estimate: looks low" (Claude's judgement, strongest few).
     StatCan never qualifies a deal on its own (Anabelle: its matches
     are often off) -- it stays reference info in dev-deals.
  3. Saves them into curated_deals as the DRAFT week ('pending',
     published=false) -- added per chain group, never wiping the other
     group or anything already reviewed -- and re-prices draft recipes.
  4. Emails a summary (or a warning) to admin@grrunch.com.

Anabelle reviews everything in app/app/dev-deals.tsx; nothing here
approves or publishes anything.

Schedule (Anabelle, 2026-09-24), Vancouver time -- Flipp's own
`available_from` showed when each chain's next flyer becomes visible:
  - Tuesday 9:00 pm   -> "tuesday" group: No Frills, Real Canadian Superstore
  - Wednesday 12:00 am -> "wednesday" group: Save-On-Foods, Safeway, Walmart
GitHub cron has no time zones, so .github/workflows/weekly-flyer-fetch.yml
fires at every UTC hour those two moments can fall on (PDT and PST), and
`--group auto` here decides from the actual Vancouver time which group,
if any, is due. A group whose draft rows for that flyer week already
exist is skipped, so the extra cron firings are harmless.

Usage:
    cd scripts && pip install -r requirements-flyers.txt
    python3 weekly_flyer_fetch.py --group tuesday         # or wednesday
    python3 weekly_flyer_fetch.py --group auto            # what cron runs
    python3 weekly_flyer_fetch.py --group tuesday --dry-run   # no DB writes, no email

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, and
optionally SMTP_USER / SMTP_PASSWORD (a Google Workspace app password)
and NOTIFY_TO for the email.
"""

import argparse
import base64
import csv
import json
import os
import re
import smtplib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from zoneinfo import ZoneInfo

import anthropic

HERE = Path(__file__).resolve().parent
VANCOUVER = ZoneInfo("America/Vancouver")

GROUPS = {
    "tuesday": ["No Frills", "Real Canadian Superstore"],
    "wednesday": ["Save-On-Foods", "Safeway", "Walmart"],
}

MERCHANT_FRAGMENTS = {
    "Safeway": ["safeway"],
    "Save-On-Foods": ["save-on-foods", "save on foods"],
    "Real Canadian Superstore": ["real canadian superstore"],
    "Walmart": ["walmart"],
    "No Frills": ["no frills", "nofrills"],
}

# curated_deals.product_url is NOT NULL -- same per-chain flyer links
# sync_weekly_deals.py falls back to.
CHAIN_URLS = {
    "Walmart": "https://www.walmart.ca/en/flyer",
    "No Frills": "https://www.nofrills.ca/en/deals/flyer",
    "Real Canadian Superstore": "https://www.realcanadiansuperstore.ca/en/deals/flyer",
    "Safeway": "https://www.safeway.ca/flyer",
    "Save-On-Foods": "https://www.saveonfoods.com/flyer",
}

# The categories the app already groups Weekly Deals by, plus Dairy &
# Eggs and Beverages -- which previously had nowhere to go but "Other".
CATEGORIES = [
    "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Deli",
    "Frozen", "Pantry", "Snacks", "Beverages",
]
PRICE_UNITS = ["package", "each", "lb", "kg", "100g"]

FLIPP = "https://backflipp.wishabi.com/flipp"
FLIPP_HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
MODEL = "claude-opus-5"
PICK_CHUNK = 200       # items per text-selection request
IMAGE_BATCH = 8        # cutouts per image-reading request
MIN_ITEMS_WARN = 30
MAX_PER_CHAIN = 80
WAIT_FOR_FLYER_MIN = 40  # scheduled runs poll this long for a flyer not visible yet


def env(name, default=None, required=True):
    value = os.environ.get(name, default)
    if required and not value:
        sys.exit(f"Missing required env var: {name}")
    return value


def load_env_file():
    # Same local-dev convenience as sync_weekly_deals.py: scripts/.env,
    # never overriding what the environment (e.g. GitHub secrets) set.
    path = HERE / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


def say(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- timing

def group_due(now):
    """Which group the schedule says is due at `now`, or None. Windows
    are wide enough to absorb GitHub's cron start delays; duplicate
    firings inside a window are harmless (see already_fetched)."""
    local = now.astimezone(VANCOUVER)
    if local.weekday() == 1 and (local.hour, local.minute) >= (20, 45):
        return "tuesday"
    if local.weekday() == 2 and local.hour < 5:
        return "wednesday"
    return None


def target_thursday(now):
    """The Thursday the upcoming flyers start on: today if it's Thursday,
    else the next one."""
    local = now.astimezone(VANCOUVER).date()
    return local + timedelta(days=(3 - local.weekday()) % 7)


def parse_ts(value):
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


# ----------------------------------------------------------------- Flipp

def http_json(url, params=None, headers=None, data=None, method=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers or FLIPP_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            body = resp.read()
    except urllib.error.HTTPError as exc:
        # Surface the server's own reason (PostgREST explains every 400).
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"{method or 'GET'} {url.split('?')[0]} -> {exc.code}: {detail}") from None
    return json.loads(body) if body else None


def load_zones(chains):
    with open(HERE / "flyer_zones.csv", newline="") as fh:
        return [row for row in csv.DictReader(fh) if row["chain"] in chains]


def pick_upcoming_flyer(flyers, chain, thursday, now):
    """The chain's WEEKLY flyer starting on `thursday` that's already
    visible. Excludes long catalogues (Walmart's "Ready for Fall" etc.)
    and the current week's flyer. Real Canadian Superstore's flyer
    starts Wednesday 9 pm Vancouver time, so the start date may land on
    the Wednesday before."""
    fragments = MERCHANT_FRAGMENTS[chain]
    candidates = []
    for f in flyers:
        merchant = (f.get("merchant") or f.get("merchant_name") or "").lower()
        if not any(fr in merchant for fr in fragments):
            continue
        vf, vt, af = parse_ts(f.get("valid_from")), parse_ts(f.get("valid_to")), parse_ts(f.get("available_from"))
        if not vf or not vt or (vt - vf) > timedelta(days=8):
            continue
        start = vf.astimezone(VANCOUVER).date()
        if start not in (thursday, thursday - timedelta(days=1)):
            continue
        if af and af > now:
            continue
        candidates.append(f)
    return candidates[0] if candidates else None


def fetch_chain(chain, zones, thursday, wait):
    """Returns (items_by_zone, flyer_dates) for one chain, or raises."""
    deadline = time.time() + (WAIT_FOR_FLYER_MIN * 60 if wait else 0)
    items_by_zone = {}
    dates = None
    for zone in zones:
        while True:
            now = datetime.now(VANCOUVER)
            flyers = http_json(f"{FLIPP}/flyers", {"locale": "en-ca", "postal_code": zone["postal_code"]})
            flyers = flyers if isinstance(flyers, list) else (flyers or {}).get("flyers", [])
            flyer = pick_upcoming_flyer(flyers, chain, thursday, now)
            if flyer or time.time() >= deadline:
                break
            say(f"    {chain} / {zone['zone']}: next flyer not visible yet, checking again in 5 min")
            time.sleep(300)
        if not flyer:
            raise RuntimeError(f"no upcoming flyer for {chain} / {zone['zone']} (week of {thursday})")
        detail = http_json(f"{FLIPP}/flyers/{flyer['id']}", {"locale": "en-ca"})
        items = (detail or {}).get("items", [])
        items_by_zone[zone["zone"]] = items
        vf = parse_ts(flyer["valid_from"]).astimezone(VANCOUVER).date()
        vt = parse_ts(flyer["valid_to"]).astimezone(VANCOUVER).date()
        # RCSS starts Wed 9 pm; store the calendar week like the others.
        dates = (max(vf, thursday).isoformat(), vt.isoformat())
        say(f"    {chain} / {zone['zone']}: flyer {flyer['id']} ({dates[0]} -> {dates[1]}), {len(items)} items")
        time.sleep(1)
    return items_by_zone, dates


def norm_name(name):
    return re.sub(r"\s+", " ", name or "").strip().casefold()


def merge_zones(chain, items_by_zone):
    """One entry per distinct (name, price) across the chain's zones, with
    the zones it appears in. Same national promo in every zone -> one
    candidate, not one per zone."""
    merged = {}
    for zone, items in items_by_zone.items():
        for it in items:
            name = (it.get("name") or "").strip()
            if not name:
                continue
            key = (norm_name(name), str(it.get("price") or ""))
            entry = merged.setdefault(key, {
                "id": it["id"], "name": name, "brand": it.get("brand"),
                "price": it.get("price") or None, "image": it.get("cutout_image_url"),
                "zones": [],
            })
            entry["zones"].append(zone)
    return list(merged.values())


# ---------------------------------------------------------------- Claude

def claude_json(client, content, schema, max_tokens=16000):
    """One structured-output call. Server-side fallbacks ("default") re-run
    a request Claude Opus 5's safety classifiers decline on another model."""
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": content}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined the request")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("Claude's answer was cut off (max_tokens)")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


PICK_SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "name": {"type": "string"},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "usage": {"type": "string", "enum": ["recipes", "deals"]},
                    "recipe_ingredient": {"type": "boolean"},
                },
                "required": ["id", "name", "category", "usage", "recipe_ingredient"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["picks"],
    "additionalProperties": False,
}

PICK_PROMPT = """You are sorting this week's grocery flyer for Grrunch, a British Columbia app that builds affordable home-cooked recipes from grocery flyer deals. This first pass only separates grocery food from everything else; a later step picks the best deals.

Below is part of {chain}'s flyer: one item per line as `id | name | brand | price`. The price is the flyer's sale price when the flyer data has one; the pictures (which you don't see here) carry the rest.

Keep grocery food and drink someone would buy for home cooking or eating: produce, meat and seafood, dairy and eggs, bakery, deli, frozen, pantry staples, snacks, non-alcoholic beverages. Skip everything else: household and cleaning products, personal care, health and pharmacy, baby formula, pet food and supplies, alcohol, tobacco, gift cards, clothing, electronics, home goods, and anything that isn't a product (store banners, coupons, loyalty-points offers with no product).

For each item you keep:
- name: a clean shopper-facing name -- brand plus product, normal capitalization, no trademark symbols, no size ranges or "up to" text (e.g. "PC® BLUE MENU® EXTRA LEAN CHICKEN BREASTS, up to 420 g" -> "PC Blue Menu Extra Lean Chicken Breasts").
- category: the best fit from the allowed list.
- usage: "recipes" when it's a cooking ingredient a recipe could be built around or use (proteins, produce, dairy, grains, sauces, bread...); "deals" when it's mainly eaten as-is (snacks, drinks, desserts, ready meals).
- recipe_ingredient: true when it's a good, versatile ingredient for affordable home cooking in general -- the kind of thing many everyday recipes use (chicken thighs, ground beef, eggs, rice, pasta, canned tomatoes, onions, cheese, frozen vegetables). false for snacks, drinks, desserts, ready meals, and niche specialty items.

Return only the items you keep.

{lines}"""


def pick_candidates(client, chain, entries):
    picks = {}
    for i in range(0, len(entries), PICK_CHUNK):
        chunk = entries[i:i + PICK_CHUNK]
        lines = "\n".join(
            f"{e['id']} | {e['name']} | {e['brand'] or ''} | {e['price'] or ''}" for e in chunk
        )
        data = claude_json(client, PICK_PROMPT.format(chain=chain, lines=lines), PICK_SCHEMA)
        valid_ids = {e["id"] for e in chunk}
        for p in data["picks"]:
            if p["id"] in valid_ids:
                picks[p["id"]] = p
    return picks


NULLABLE_NUMBER = {"anyOf": [{"type": "number"}, {"type": "null"}]}
NULLABLE_INT = {"anyOf": [{"type": "integer"}, {"type": "null"}]}
READ_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "sale_price": NULLABLE_NUMBER,
                    "regular_price": NULLABLE_NUMBER,
                    "price_unit": {"type": "string", "enum": PRICE_UNITS},
                    "multi_buy_qty": NULLABLE_INT,
                    "saving_text": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                },
                "required": ["id", "sale_price", "regular_price", "price_unit", "multi_buy_qty", "saving_text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

READ_PROMPT = """Each image below is one product tile cut out of a {chain} grocery flyer, preceded by its id. For each tile, read what's printed on it:
- sale_price: the price the shopper pays now. For a multi-buy like "2 for $5", the total ($5). null if no price is printed.
- regular_price: the regular / "Reg." / "was" / "before" price only if the tile prints one, as a number. null if the tile shows no regular price -- never estimate one.
- price_unit: what sale_price is per -- "lb", "kg" or "100g" when printed per weight; "each" when printed per item (e.g. "$1.99 ea"); otherwise "package".
- multi_buy_qty: the count in a multi-buy ("2 for $5" -> 2); null otherwise.
- saving_text: any saving the tile prints, copied short ("Reg. $12.99", "Save $3", "30% off", "2 for $5"); null if the tile shows no saving at all.
Return one entry per id."""


FINAL_SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "reason": {"type": "string", "enum": ["saving_on_flyer", "good_recipe_ingredient", "ai_estimate_low"]},
                },
                "required": ["id", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["picks"],
    "additionalProperties": False,
}

FINAL_PROMPT = """Pick this week's deal candidates from {chain}'s flyer for Grrunch, a British Columbia app that builds affordable home-cooked recipes from grocery deals. A human reviews every pick, so choose at most {limit} -- the ones most worth her time -- and skip the rest.

Each line is one grocery food item: `id | name | sale price | printed saving | good recipe ingredient`.

An item qualifies for one of three reasons, in this order of strength:
1. saving_on_flyer -- the tile prints a real saving (regular/was price, "save" amount, % off, multi-buy). Prefer bigger savings.
2. good_recipe_ingredient -- a good, versatile ingredient for affordable home cooking, at a sensible price.
3. ai_estimate_low -- no printed saving and not a core recipe ingredient, but the price looks clearly low for BC in your judgement. Use this sparingly: only the strongest few.

Give each pick the strongest reason that applies. If more than {limit} items qualify, keep the strongest: bigger savings and more useful ingredients first, and avoid near-duplicates (several flavours or sizes of the same product -> keep the best one or two).

{lines}"""

REASON_LABELS = {
    "saving_on_flyer": "Saving on flyer",
    "good_recipe_ingredient": "Good recipe ingredient",
    "ai_estimate_low": "AI estimate: looks low",
}


def final_pick(client, chain, food, picks, readings):
    lines = []
    for e in food:
        r = readings.get(e["id"], {})
        price = to_number(e["price"]) or to_number(r.get("sale_price"))
        if price is None:
            continue
        unit = r.get("price_unit") or "package"
        price_text = f"${price:.2f}" + ("" if unit == "package" else f"/{unit}")
        lines.append(
            f"{e['id']} | {picks[e['id']]['name']} | {price_text} | {r.get('saving_text') or '-'} | "
            f"{'yes' if picks[e['id']]['recipe_ingredient'] else 'no'}"
        )
    data = claude_json(client, FINAL_PROMPT.format(chain=chain, limit=MAX_PER_CHAIN, lines="\n".join(lines)),
                       FINAL_SCHEMA)
    valid = {e["id"] for e in food}
    chosen = {}
    for p in data["picks"]:
        if p["id"] in valid and p["id"] not in chosen:
            chosen[p["id"]] = p["reason"]
    return dict(list(chosen.items())[:MAX_PER_CHAIN])


def download(url):
    url = (url or "").replace("http://", "https://", 1)
    req = urllib.request.Request(url, headers=FLIPP_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read(), resp.headers.get("Content-Type", "image/jpeg")


def read_cutouts(client, chain, entries):
    """{id: {sale_price, regular_price, price_unit, multi_buy_qty}} for the
    picked entries that have a cutout image. Also returns the downloaded
    bytes so the image can be re-hosted without fetching it twice."""
    images = {}
    for e in entries:
        if not e["image"]:
            continue
        try:
            images[e["id"]] = download(e["image"])
        except Exception as exc:
            say(f"    warning: couldn't download cutout for {e['name']}: {exc}")

    batches = [list(images.items())[i:i + IMAGE_BATCH] for i in range(0, len(images), IMAGE_BATCH)]

    def read_batch(batch):
        content = [{"type": "text", "text": READ_PROMPT.format(chain=chain)}]
        for item_id, (data, ctype) in batch:
            content.append({"type": "text", "text": f"id {item_id}:"})
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": ctype if ctype.startswith("image/") else "image/jpeg",
                           "data": base64.b64encode(data).decode()},
            })
        ids = {item_id for item_id, _ in batch}
        return [r for r in claude_json(client, content, READ_SCHEMA)["items"] if r["id"] in ids]

    readings = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(read_batch, batches):
            for r in result:
                readings[r["id"]] = r
    return readings, images


# -------------------------------------------------------------- Supabase

def in_list(values):
    """PostgREST `in.(...)` filter value, URL-encoded (chain names have spaces)."""
    return urllib.parse.quote("(" + ",".join(json.dumps(v) for v in values) + ")", safe="")


def supabase(path, method="GET", body=None, prefer=None, content_type="application/json"):
    headers = {"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}
    if body is not None:
        headers["Content-Type"] = content_type
    if prefer:
        headers["Prefer"] = prefer
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    return http_json(f"{SUPABASE_URL}{path}", headers=headers, data=data, method=method)


def already_fetched(chains, week_from):
    """True when every chain in the group already has candidate rows for
    this flyer week in the draft -- a repeat cron firing, nothing to do."""
    rows = supabase(
        "/rest/v1/curated_deals?published=eq.false&select=chain_name"
        f"&flyer_valid_from=eq.{week_from}&chain_name=in.{in_list(chains)}"
    ) or []
    return {r["chain_name"] for r in rows} >= set(chains)


def reviewed_pricing():
    """Pricing refinements Anabelle made by hand in dev-deals (price unit,
    package weight, recipes/deals usage) for items seen in earlier weeks,
    keyed by (chain, normalized name) -- carried onto the same item when it
    comes back, same idea as sync_weekly_deals.py's fetch_reviewed_pricing
    (which keyed by Airtable record id, gone now)."""
    rows = supabase(
        "/rest/v1/curated_deals?pricing_reviewed_at=not.is.null&order=pricing_reviewed_at.asc"
        "&select=chain_name,item_name,price_unit,package_weight_g,package_weight_g_source,"
        "fragment_by_weight,usage,keyword_matches,pricing_reviewed_at"
    ) or []
    return {(r["chain_name"], norm_name(r["item_name"])): r for r in rows}


def rehost(item_id, data, ctype):
    """Permanent copy in the deal-thumbnails bucket (Flipp's cutout URLs
    aren't ours to rely on). Best-effort, like sync_weekly_deals.rehost_image."""
    ext = ".png" if "png" in (ctype or "") else ".jpg"
    filename = f"flipp_{item_id}{ext}"
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/storage/v1/object/deal-thumbnails/{filename}", data=data, method="POST",
            headers={"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}",
                     "Content-Type": ctype or "image/jpeg", "x-upsert": "true"},
        )
        urllib.request.urlopen(req, timeout=30).close()
        return f"{SUPABASE_URL}/storage/v1/object/public/deal-thumbnails/{filename}"
    except Exception as exc:
        say(f"    warning: couldn't re-host image {filename}: {exc}")
        return None


def pick_reason(reason, reading):
    """What dev-deals shows as why Claude picked this candidate."""
    label = REASON_LABELS[reason]
    if reason == "saving_on_flyer" and reading.get("saving_text"):
        return f"{label}: {reading['saving_text']}"
    return label


def to_number(value):
    try:
        return round(float(value), 2) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def build_rows(chain, entries, picks, chosen, readings, images, dates, all_zones, prior):
    rows = []
    for e in entries:
        pick = picks.get(e["id"])
        if not pick or e["id"] not in chosen:
            continue
        reading = readings.get(e["id"], {})
        price = to_number(e["price"]) or to_number(reading.get("sale_price"))
        if price is None:
            continue  # no readable price anywhere -- not reviewable as a deal
        regular = to_number(reading.get("regular_price"))
        qty = reading.get("multi_buy_qty")
        data, ctype = images.get(e["id"], (None, None))
        base = {
            "chain_name": chain,
            "item_name": pick["name"],
            "category": pick["category"],
            "price": price,
            "original_price": regular if regular and regular > price else None,
            "original_price_source": "flyer",
            "product_url": CHAIN_URLS[chain],
            "flyer_valid_from": dates[0],
            "flyer_valid_to": dates[1],
            "image_url": rehost(e["id"], data, ctype) if data else None,
            "status": "pending",
            "published": False,
            "usage": pick["usage"],
            "price_unit": reading.get("price_unit") or "package",
            "bundle_count": qty if qty and qty > 1 else None,
            # PostgREST bulk inserts need every row to have the same keys,
            # so carried-forward fields are always present (first test
            # run, 2026-09-24: a 400 on the mixed batch).
            "package_weight_g": None,
            "package_weight_g_source": None,
            "fragment_by_weight": False,
            "keyword_matches": [],
            "pick_reason": pick_reason(chosen[e["id"]], reading),
        }
        carried = prior.get((chain, norm_name(pick["name"])))
        if carried:
            base.update({
                "price_unit": carried["price_unit"],
                "package_weight_g": carried["package_weight_g"],
                "package_weight_g_source": carried["package_weight_g_source"],
                "fragment_by_weight": carried["fragment_by_weight"],
                "usage": carried["usage"],
                "keyword_matches": carried["keyword_matches"] or [],
            })
        # Same price in every zone the chain has -> applies everywhere
        # (zone left null). Otherwise one row per zone it's priced for, so
        # lib/dealZones.ts can show it only to shoppers in that zone.
        zones = sorted(set(e["zones"]))
        if set(zones) >= set(all_zones):
            rows.append({**base, "zone": None})
        else:
            rows.extend({**base, "zone": z} for z in zones)
    return rows


def replace_group_draft(chains, week_from, rows):
    """Clears this group's STILL-PENDING draft rows (a re-run of the same
    week, or last week's leftovers) and inserts the new candidates. Rows
    Anabelle already approved or rejected are kept, and the other group's
    chains are never touched."""
    chain_list = in_list(chains)
    supabase(
        f"/rest/v1/curated_deals?published=eq.false&status=eq.pending&chain_name=in.{chain_list}",
        method="DELETE", prefer="return=minimal",
    )
    # Last week's reviewed draft rows for these chains are stale too.
    supabase(
        f"/rest/v1/curated_deals?published=eq.false&chain_name=in.{chain_list}"
        f"&flyer_valid_from=lt.{week_from}",
        method="DELETE", prefer="return=minimal",
    )
    kept = supabase(
        f"/rest/v1/curated_deals?published=eq.false&chain_name=in.{chain_list}&select=chain_name,item_name,price,zone"
    ) or []
    kept_keys = {(k["chain_name"], norm_name(k["item_name"]), k["price"], k["zone"]) for k in kept}
    fresh = [r for r in rows if (r["chain_name"], norm_name(r["item_name"]), r["price"], r["zone"]) not in kept_keys]
    for i in range(0, len(fresh), 200):
        supabase("/rest/v1/curated_deals", method="POST", body=fresh[i:i + 200], prefer="return=minimal")
    return len(fresh), len(kept)


def refresh_draft_recipes():
    supabase("/rest/v1/rpc/refresh_recipe_deal_tags", method="POST", body={"p_published": False})


# ----------------------------------------------------------------- email

def send_email(subject, body):
    user, password = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD")
    to = os.environ.get("NOTIFY_TO", "admin@grrunch.com")
    if not user or not password:
        say("(email not configured -- SMTP_USER / SMTP_PASSWORD unset; summary printed above only)")
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, user, to
    msg.set_content(body)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(user, password)
        smtp.send_message(msg)
    say(f"emailed {to}")


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", choices=["auto", "tuesday", "wednesday"], default="auto")
    ap.add_argument("--dry-run", action="store_true", help="fetch and pick, but don't write or email")
    ap.add_argument("--force", action="store_true", help="run even if this week's draft already has these chains")
    args = ap.parse_args()

    now = datetime.now(VANCOUVER)
    group = group_due(now) if args.group == "auto" else args.group
    if not group:
        say(f"Nothing scheduled at {now:%a %H:%M} Vancouver time -- exiting.")
        return
    chains = GROUPS[group]
    thursday = target_thursday(now)
    say(f"{group} fetch for the week starting {thursday}: {', '.join(chains)}")

    if not args.force and not args.dry_run and already_fetched(chains, thursday.isoformat()):
        say("Already fetched for this week -- nothing to do.")
        return

    client = anthropic.Anthropic()
    prior = {} if args.dry_run else reviewed_pricing()
    summary, problems, all_rows = [], [], []
    for chain in chains:
        try:
            zones = load_zones([chain])
            items_by_zone, dates = fetch_chain(chain, zones, thursday, wait=args.group == "auto")
            for zone, items in items_by_zone.items():
                if len(items) < MIN_ITEMS_WARN:
                    problems.append(f"{chain} / {zone}: only {len(items)} items in the flyer -- worth a look")
            entries = merge_zones(chain, items_by_zone)
            picks = pick_candidates(client, chain, entries)
            food = [e for e in entries if e["id"] in picks]
            readings, images = read_cutouts(client, chain, food)
            chosen = final_pick(client, chain, food, picks, readings)
            rows = build_rows(chain, entries, picks, chosen, readings, images, dates,
                              [z["zone"] for z in zones], prior)
            all_rows.extend(rows)
            by_reason = {}
            for reason in chosen.values():
                by_reason[REASON_LABELS[reason]] = by_reason.get(REASON_LABELS[reason], 0) + 1
            reasons = ", ".join(f"{n} {label.lower()}" for label, n in by_reason.items())
            summary.append(f"{chain}: {len(chosen)} candidates ({reasons}) from {len(food)} food items "
                           f"of {len(entries)} in the flyer")
            say(f"  {summary[-1]}")
        except Exception as exc:
            problems.append(f"{chain}: FAILED -- {exc}")
            say(f"  !! {problems[-1]}")

    if args.dry_run:
        say(json.dumps(all_rows[:10], indent=2, ensure_ascii=False))
        say(f"Dry run -- {len(all_rows)} rows would be saved. Nothing written.")
        return

    ok_chains = sorted({r["chain_name"] for r in all_rows})
    if all_rows:
        inserted, kept = replace_group_draft(ok_chains, thursday.isoformat(), all_rows)
        refresh_draft_recipes()
        say(f"Saved {inserted} new candidates ({kept} already-reviewed rows kept); draft recipes re-priced.")

    label = "Tuesday" if group == "tuesday" else "Wednesday"
    if problems:
        subject = f"Grrunch {label} flyer fetch: needs attention"
    else:
        subject = f"Grrunch {label} flyer fetch: {len(all_rows)} candidates ready to review"
    body = "\n".join(
        [f"Week starting {thursday:%A %B %-d}.", ""]
        + summary
        + ([""] + ["Problems:"] + problems if problems else [])
        + ["", "Review them in the app's dev-deals screen."]
    )
    send_email(subject, body)
    if problems and not all_rows:
        sys.exit(1)


if __name__ == "__main__":
    load_env_file()
    SUPABASE_URL = env("SUPABASE_URL", required=False) or ""
    SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY", required=False) or ""
    if not (SUPABASE_URL and SERVICE_ROLE) and "--dry-run" not in sys.argv:
        sys.exit("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    try:
        main()
    except Exception as exc:
        # Never fail silently -- the whole point of the email is that
        # Anabelle doesn't have to check GitHub.
        if "--dry-run" not in sys.argv:
            send_email("Grrunch flyer fetch: FAILED",
                       f"The weekly flyer fetch crashed and saved nothing:\n\n{exc}\n\n"
                       "Details: GitHub > Actions > Weekly flyer fetch.")
        raise
