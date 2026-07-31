# Grrunch — Functional Analysis & Architecture (Draft v2)

## 1. Product Summary

Grrunch is a React Native (iOS + Android) app for BC grocery shoppers, built
around **budget-driven meal planning**. A user sets their stores, meal count,
serving/macro targets, and dietary exclusions; Grrunch's AI generates 10
meals **built primarily from that week's curated flyer deals** at the
selected stores, consolidates them into a single grocery list, and shows a
projected total price. Every grocery list item deep-links to the retailer's
own product page — Grrunch never sells or processes the transaction itself.

**MVP chains:** Save-On-Foods, Real Canadian Superstore / No Frills, Safeway,
T&T Supermarket, Walmart.

**Core value prop:** "Tell us your budget and dietary needs — we'll build
your week's meals and grocery list, priced across the stores you actually
shop at."

**Mission framing (locked):** Grrunch aims to be a genuinely **fair** offer,
not a polished-but-misleading one. It is not a nutrition/dietitian service
and doesn't claim to be — recipes and servings aim to get as close as
possible to a person's stated calorie/macro needs within their budget, but
at the cost-optimized end of the spectrum this will often mean thinner
protein and vegetable servings than an ideal diet would call for. The app
should be transparent about this tradeoff rather than hiding it — e.g.
surfacing when a plan is heavily staple-based, and being honest that it's a
budget tool first, not a substitute for professional nutrition guidance.

**Legitimacy principle (locked):** Deal *discovery* happens through legitimate,
human-reviewed access (publicly posted flyers, manually reviewed — never live
scraping). Meals and grocery list pricing are built primarily from these
already-reviewed deals, so pricing stays grounded in curated, approved data.
Every grocery list item deep-links to the retailer's own permanent product
page for the real, current price. Grrunch never republishes a retailer's
full price catalog as its own live dataset.

---

## 2. Functional Analysis

### 2.1 Landing Page — Two Honest Sections, Not One Padded List

**"Best Deals"** — items with a genuinely significant margin between regular
and deal price (e.g. discount_pct above a set threshold, exact number TBD —
see open questions). This is meant to be a real bar, not a marketing label:
if this week's approved deals don't clear it, the section shows an honest
empty state ("nothing this outstanding this week — check back soon") rather
than being backfilled with weaker deals just to look full.

**"Worth It"** — solid deals that don't clear the "Best Deals" bar but are
still genuinely good (a lower discount_pct threshold). Same rule applies: if
nothing qualifies, show an empty state rather than padding.

- Both sections pull from `curated_deals`, ranked by `discount_pct` within
  their respective threshold bands
- This two-tier honesty principle extends the mission framing (section 1) —
  the app shouldn't inflate what's actually on offer, even on the very first
  screen someone sees
- No login, no store selection required yet — this is meant to demonstrate
  value in seconds, before asking anything of the user (consistent with the
  anonymous-first/lightweight-consent approach — see Step 0 below)
- Tapping a featured deal can lead into two places: (a) deep-link straight to
  the retailer's product page, for someone who just wants to see the deal, or
  (b) a lightweight prompt — "want a full meal plan built around deals like
  this?" — funneling into the Setup flow
- This becomes the natural, low-friction on-ramp into the core meal-planning
  flow, rather than starting with a setup form
- **Dependency:** both sections require `original_price` to be reliably
  captured for every reviewed deal (not just `price`) — this was already
  flagged as essential in the Admin Review Tool row, and this feature makes
  that requirement non-negotiable rather than nice-to-have, since without a
  real regular price there's no honest way to compute "significant margin"

### 2.2 Primary User Flow — Budget Meal Plan (core MVP flow)

**Step 0 — Consent (lightweight, no account required)**
- On first use, user sees a brief terms-of-use / privacy notice and taps "I agree" — logged at the device/session level (no email/signup required)
- This covers the core flow (setup, meal generation, grocery list, deep links) with zero signup friction, while still keeping data collection consent-clean from the very first interaction
- **Account creation is only required when the user wants to save something** — a recipe, a plan, or to persist their setup across sessions. That's a natural, motivated moment to ask, since they've already seen value
- When an account is created, the earlier session-level consent gets linked to the new account record (so there's a continuous consent trail, not a gap)

**Step 1 — Setup**
- **Store selection (up to 5, one per supported chain):**
  - **If location accepted:** app finds and shows the nearest physical location of each of the 5 supported chains, pre-selected as the user's stores.
  - **If location declined:** falls back to coarse IP-based location (city-level, no permission needed) to still estimate and show the nearest location per chain.
  - Either way, the result is the same shape (up to 5 stores, one per chain) — location just determines how accurately the initial suggestion is targeted.
  - **Editing that selection (adding/removing a chain, swapping a location, searching manually) is a paid-tier feature** — free tier locks the 5 auto-selected stores as-is (see section 2.5).
- User selects number of meals (default 10; excludes snacks/breakfast for MVP)
- **User builds a household**: adds one or more people, each with their own serving targets (calories + macros) and their own exclusions (allergies, dietary restrictions)
  - e.g. a household of 4 (man, woman, 2 children) — each person gets their own profile, not one shared setting
  - Household size affects **ingredient quantities** in the final grocery list (scaled to feed everyone, not just one serving)
  - **Exclusions are combined across the household** — if any one person has a peanut allergy, peanuts are excluded from all household meals (MVP assumes shared family meals, not separately-cooked meals per person)
  - Individual calorie/macro targets are summed/averaged to size servings appropriately, but the *meal itself* stays a single shared dish per meal slot (no per-person separate meals in MVP — that's a much larger feature, flagged as post-MVP below)
- **Cost vs. diversity slider (1–10)**: user chooses where their plan sits between "cheapest possible" (1 — leans hard into whichever single protein/staple is cheapest this week, high repetition) and "most variety" (10 — rotates proteins/ingredients for interest, at a higher price-per-meal). App shows the resulting price-per-meal difference live so the tradeoff is transparent, not hidden. Meal generation must optimize primarily along this axis, not default to variety — cost-consciousness is the core value prop, so the default slider position should sit low/cost-leaning, not centered
- **Honesty disclosure (per mission framing above)**: when a plan leans heavily on cost optimization (low slider values), the app should visibly flag that protein/vegetable servings are thinner than an ideal diet, rather than presenting the plan as nutritionally complete. Grrunch is a budget tool, not a dietitian — this should be stated plainly, not buried in fine print

**Step 2 — Meal generation**
- AI proposes a set of meals built from **two combined ingredient pools**:
  1. **This week's approved flyer deals** at the user's selected stores (variable, time-sensitive discounts)
  2. **A maintained list of structurally cheap staples** (pasta, rice, beans, lentils, oats, canned goods, etc.) — these are reliably low-cost most weeks regardless of what's on sale, so the engine can lean on them deliberately as meal *bases*, not just side items
- The cost-vs-diversity slider (below) governs how much a meal draws from cheap staples vs. this week's specific deal proteins/produce — leaning cost-first naturally means more staple-based meals (e.g. a pasta or rice dish built around whatever protein is cheapest), not just "protein X five ways"
- A small number of common non-sale extras (e.g. onions, garlic) may round out a recipe even if they're not this week's deal items — these get a light, periodically-checked reference price rather than a full maintained catalog
- User reviews the proposed 10 meals, can ask for a **swap** (AI regenerates
  an alternative meal under the same constraints)

**Step 3 — Grocery list generation**
- Grrunch consolidates ingredients across all 10 chosen meals into a single grocery list (deduplicated — e.g. "chicken thighs" appears once even if used in 3 recipes)
- Pantry basics excluded by default from the priced list (oil, salt, common spices, paper goods) — flagged separately as "you'll also need"
- Each grocery item shows: ingredient name, quantity needed, reference/average price, and which of the user's selected stores it's cheapest at (if data available across multiple)
- **Projected total price** shown at the top of the list

**Step 4 — Review & shop**
- User can add, edit, or remove items from the generated grocery list
- Each item deep-links to the retailer's product page for the live/exact price
- (Post-MVP) list can be checked off while shopping, or exported/shared

### 2.3 Save Recipe (supporting feature)
- From a generated meal, user can tap "Save" to keep the recipe (name, ingredients list, serving/macro info) for later reference
- If the user doesn't have an account yet, saving is the prompt to create one (see Step 0) — this is the natural, motivated moment to ask, not a signup wall on first launch
- **Saved recipes are a static snapshot** — ingredients are stored as plain text/quantities, not linked to `curated_deals` or `product_url`. Once saved, the recipe's price is frozen at whatever it was when saved (or simply not shown/recalculated) since the underlying deal may expire, change, or no longer exist
- Re-adding a saved recipe to a future grocery list means its ingredients get re-priced fresh against *that* week's current deals/staples — the saved recipe itself never auto-updates
- This keeps saved recipes simple (no ongoing link-maintenance burden) at the cost of the saved price becoming stale/informational only

### 2.4 Secondary Flow — Deal Browse (full browsing, beyond the landing page highlights)
- Weekly curated deal highlights per store still get ingested/reviewed (see pipeline below) — this dataset now doubles as the primary input for meal generation and the landing page
- Full "This week's deals" browse view (filterable by store/category) for users who want to look beyond the landing page's top highlights, without going through meal planning

### 2.5 Monetization — Free vs. Paid Tiers

**Pricing: not yet locked.** Free/paid feature split is set (below), but actual
subscription price is deliberately deferred until there's real usage data on
how much users actually save — the dry-run estimate (~$60/week vs. a ~$600/month
struggle-baseline) is promising but is n=1 and needs validation across real
weeks, real flyers, and real households before pricing decisions get made.

**Implication for build:** the app needs to **track and surface projected
savings per plan/user**. Mechanism: flyers/product pages already show both
the sale price and the regular (pre-discount) price for each deal item — this
is already captured as `price` vs. `original_price` in `curated_deals`. A
plan's **baseline price** = the same grocery list priced at each item's
regular price instead of its sale price; **savings** = the sum of those
discounts across the list. This is fully computable from data already being
reviewed/captured — no external benchmark or guessing needed, and the claim
is literally true rather than modeled.

**Free tier** (taste of the product, not crippled):
- All 5 nearest stores auto-selected (one per chain, per Step 1's location
  logic) — locked as-is; removing a store or swapping a location requires
  upgrading. (Supersedes an earlier draft of this section, which had free
  tier capped at 1 store — the store *count* was never the free/paid split,
  editability is.)
- 5 meals per plan (grocery list fully priced/functional — not limited)
- 1 household member profile (single set of macros/exclusions — no per-person customization)
- No this-week's-deals notifications
- Limited/no meal swap-regeneration
- 1–2 saved recipes max

**Paid tier** (full experience, price TBD):
- Same 5 stores, fully editable — remove a store or change its location
- 10 meals per plan
- Multiple household member profiles (individual macros/exclusions per person, combined into shared meals)
- Deal notifications enabled
- Unlimited swap/regenerate
- Unlimited saved recipes/plans

Revenue strategy overall (per business discussion): subscriptions + Instacart/affiliate referral commission run as parallel early revenue streams once meal planning is the core value prop (not deal-browsing alone) — store partnerships and data-intelligence licensing are longer-term, later-stage layers on top, not early income sources. Mission framing (food-affordability focus) doesn't preclude strong monetization — paying users are a different segment than users most in need, and grant/social-impact funding is a plausible additional revenue source worth exploring once there's traction.

### 2.6 Non-Goals for MVP
- No in-app checkout, cart, or payment (deep-link only)
- No live/real-time pricing — deal prices are as fresh as the weekly review cycle; exact price always confirmed on the retailer's page
- ~~No persistent recipe library in v1~~ — **SUPERSEDED**: a persistent `recipes` table now exists (see section 3.2), populated by AI generation from Airtable-tagged deal ingredients plus manual entry. Meal plan generation draws from this library instead of generating every meal from scratch per session.
- No snack/breakfast planning in MVP
- No multi-week planning in MVP (one week at a time)
- No per-person separate meals — households get shared meals with combined exclusions and scaled servings, not individually customized dishes per family member (real feature, but a much bigger one — flagged for post-MVP consideration)

---

## 3. System Architecture

```
┌───────────────────────────────────────────────┐
│  Regional Flyer Feed Exports                       │  per chain, per zone —
│  (structured JSON + cutout images, one          │  ~10 core zones + ~5
│  zip per chain/zone, e.g. Flipp/Wishabi)        │  optional across 6 chains
└────────────┬──────────────────────────────────┘
             │ (1) parse flyer.json; keep only items
             │     with both a price AND a discount
             │     signal (candidates, not trusted facts)
             ▼
┌─────────────────────────┐
│  Candidate Filter            │  discount is Wishabi's own
│                               │  rounded %, not always a real
│                               │  price comparison — never
│                               │  trusted on its own
└────────────┬─────────────┘
             │ (2) re-host each candidate's cutout image to
             │     Supabase Storage (never hotlink the feed's
             │     own CDN — not a stable URL for us to depend
             │     on) + read the image to confirm the *real*
             │     printed original_price
             ▼
┌─────────────────────────┐
│  Price Verification          │  reject (status: remove) rather
│  (vision read of cutout)     │  than fabricate when no genuine
│                               │  two-price comparison exists —
│                               │  e.g. two different product
│                               │  variants mistaken for a markdown
└────────────┬─────────────┘
             │ (3) human review queue
             ▼
┌─────────────────────────┐
│  Admin Review Tool           │  classify usage (recipes/deals/
│  (Airtable, free tier)       │  both/remove), tag the flyer zone,
│                               │  final approve/reject on price
└────────────┬─────────────┘
             │ (4) publish — wipes and replaces the
             │     previous week's rows (both here and in
             │     curated_deals; deals are this-week-only)
             ▼
┌───────────────────────────────────────────────┐
│              Grrunch Database (Supabase)          │
│  curated_deals · staple_reference_prices · stores  │
│  recipes (persistent) · meal_plans                   │
└────────────┬──────────────────────────────────────┘
             │ (5) API reads
             ▼
┌─────────────────────────┐
│  Backend API                │  REST/GraphQL:
│  (Supabase)                 │  - meal plan generation (AI reads this
│                              │    week's curated_deals + user inputs)
│                              │  - grocery list consolidation + pricing
│                              │  - deal browse, store/location queries
│                              │    (Google Places API for "near me")
└────────────┬─────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│  React Native App (iOS + Android)                │
│  Setup (stores/macros/exclusions) → AI meal        │
│  suggestions (from this week's deals) → swap →     │
│  grocery list (priced, editable) → deep link out    │
└─────────────────────────────────────────────┘
```

### 3.1 Components

| Component | Responsibility | Notes |
|---|---|---|
| ~~Ingestion Service~~ / ~~AI Extraction Layer~~ | ~~Downloads public flyer pages; AI vision-parses them into candidate deals~~ | **SUPERSEDED** — see Flyer Feed Parser + Price Verification below. Manually-uploaded flyer PDFs and from-scratch AI vision parsing were the v1 approach; discovering a structured per-region flyer data feed (JSON + pre-cropped item images, e.g. Flipp/Wishabi) made both unnecessary |
| Flyer Feed Parser | Downloads/receives each chain+zone's structured export (`flyer.json` + cutout images), keeps only items with a genuine deal signal present as **candidates** | The feed's own `discount` field is a rounded whole-number percent and is not always a genuine price comparison (e.g. two product variants, or a loyalty-points promo, can produce a discount-shaped number with no real markdown behind it) — it gates which items get reviewed, it is never written to the database as fact. **The signal itself is chain-specific, not universal**: some chains (Superstore, Safeway, No Frills, Walmart) populate `discount` reliably enough to filter on directly; T&T's feed never populates `discount` at all, yet still runs real markdowns — encoded only as tile text (`"N/$X or $Y/ea"` multi-buy pricing, or `Special Offer` vs `Member Price` tiering), unreadable from any JSON field. A missing `discount` means "check the tile for this chain's own pattern," not "no deal exists" |
| Price Verification | Re-hosts each candidate's cutout image to Supabase Storage (`deal-thumbnails` — never hotlinks the feed's own CDN, which isn't a stable URL for us to depend on week to week); reads the image to confirm the literal printed `original_price` | `price` (sale price) comes straight from the feed and has been reliable; `original_price` must be read off the image, never computed backward from `price / (1 - discount%)` — that reverses an already-rounded number and can be off by several cents. Items with no genuine two-price comparison on the tile get flagged for rejection rather than assigned an invented number |
| Admin Review Tool | Classify each candidate deal's usage; tag its flyer zone; attach product URLs; final human approve/reject on price; maintain the small staple reference-price list | Airtable (free tier) — no-code, avoids build time and cost for v1. `status`: `recipes` (fetched into the recipe library), `deals` (surfaced in the app's Deals section), `both`, or `remove`. `Select`: `Pending`/`Approved` — the human safety net that catches what automated price-verification can't (e.g. a variant-price mix-up that isn't structurally distinguishable from a real discount). **Wiped and replaced every week** — deals are this-week-only, not an accumulating history |
| Recipe Generation | Weekly batch job: for that week's `recipes`/`both`-tagged deal ingredients, checks the existing `recipes` table for a similar-enough match before generating a new one (avoids the table filling up with near-duplicate "chicken breast + rice" recipes every time the same ingredient goes back on deal) — reuses the existing recipe if a good match exists, otherwise generates and inserts a new one. A new recipe's anchor ingredient must consume the *whole* deal package as sold — scale `servings` up rather than use a fraction and strand the rest (see section 5, item 12). Plus manual entry for curator-authored recipes. Also re-matches every existing recipe's ingredients against the new week's `curated_deals`, refreshing `deal_tags` (discount/price/store/image/quantity-estimated flag) so a recipe's "on sale" info always reflects the current week | Claude API call per weekly generation batch, never per user session — the `recipes` table itself only grows and is never wiped, unlike `curated_deals` |
| Meal Plan Engine | Given user's macro/exclusion/budget/store inputs, selects and assembles a meal plan from the `recipes` library | Runs server-side. **Pure database query — never calls AI live**, even if that means a plan is occasionally thinner on options rather than generating on the fly. Optimizes along the cost-vs-diversity slider (1–10) — low end leans into cheap staples (pasta/rice/beans) as meal bases plus whichever protein/deal is cheapest, even if repetitive; high end rotates ingredients for variety at higher cost. **A recipe with zero currently-active `deal_tags` stops surfacing entirely** (rather than showing at regular price) until one of its ingredients is on sale again — the app's core value prop is deal-driven planning, not a general cookbook |
| Grocery List Generator | Consolidates ingredients across chosen meals, dedupes, excludes pantry basics, sums deal prices + light staple reference prices | Core budget-projection logic |
| Grrunch Database | Stores curated deals, staple reference prices, store locations, generated meal plans | Never a scraped/live full price catalog |
| Backend API | Serves app queries: meal plan generation, grocery list, deal browse | Supabase; store location lookups via Google Places API |
| React Native App | Setup flow, meal review/swap, grocery list, deep-linking out | Expo-based per earlier decision |

### 3.2 Data Model (sketch)

**stores**
`id, chain_name, banner, address, lat, lng, hours` — populated via Google Places API

**curated_deals**
`id, chain_name, item_name, category, price, original_price, discount_pct, product_url, flyer_valid_from, flyer_valid_to, image_url, status, reviewed_by, reviewed_at, airtable_record_id, created_at`
— this is now also the primary ingredient/pricing pool for meal generation and the real, live data behind the Best Deals tab (77 rows synced from Airtable as of this writing). `status` in Airtable is now `recipes`/`deals`/`both`/`remove` (see 3.1); Supabase's `curated_deals.status` stays the simpler `approved`-gated RLS read (every synced row is pre-approved by the time it's synced). **`zone` still needs to be added** to both Airtable and this table — with multiple regional flyer exports per chain now in play (see below), `chain_name` alone is no longer enough to disambiguate rows, and this table (plus the app's queries against it) needs to filter by the user's resolved zone, not just chain. **Wiped and replaced every week**, same as the Airtable staging table — this is explicitly this-week's-deals data, not an accumulating history

**recipes** *(persistent library — supersedes the "no persistent recipe library, generate per session" MVP decision; see 2.6)*
`id, name, ingredients (json: name, quantity, unit), instructions (json: ordered steps), deal_tags (json: [{name, discount_pct, store, image_url, quantity_estimated}] — one entry per ingredient sourced from a real curated_deals item, re-matched weekly, see 3.1), calories, protein, minutes, price (estimated per serving), servings (real yield of the recipe's anchor ingredient(s) as sold — not an arbitrary picked number), source (ai_generated / manual), source_deal_ids[] (nullable — curated_deals rows the recipe was inspired by, for traceability only, not a live price link), created_at`
— ingredients are stored as plain text, decoupled from any specific week's deal (deals rotate weekly, recipes are meant to be reusable across weeks) — same "static snapshot" philosophy as saved_recipes below, just curator/AI-populated instead of user-populated. Unlike `curated_deals`, **this table is never wiped** — only `deal_tags` gets refreshed weekly against whatever's currently in `curated_deals`

**Flyer zones** *(regional flyer variants — not yet its own table; open question, see section 5)*
— research turned up ~10 "core" zones + ~5 lower-priority "optional" zones needed to cover BC's real regional flyer variation across the 6 chains (e.g. Safeway has one flyer for all of BC except the East Kootenay/Peace region, which gets its own edition; Save-On-Foods has 3 distinct price tiers by region). A user's resolved zone per chain needs to be derivable from location data the app already collects (device GPS / the `nearest-stores` lookup), most likely via a small static lookup table (postal-code-prefix or city → zone) rather than a live geocoding service, since the zone boundaries themselves are manually researched, not API-derivable. **Recipes stay zone-agnostic** — `deal_tags` are matched against one canonical "core" zone per chain to keep the recipe library simple and shared across all users, rather than varying per user. Best Deals and any live grocery pricing, by contrast, should filter `curated_deals` to the user's actual resolved zone

**staple_reference_prices** *(a maintained list of structurally cheap staples — pasta, rice, beans, lentils, oats, canned goods, plus small rounding-out extras like onions/garlic. Used deliberately as meal *bases* for cost-leaning plans, not just accessories)*
`id, ingredient_name, category (base_staple / rounding_out_extra), avg_price, unit, last_checked_at, checked_by`

**household_members** *(one or more per meal plan — supports mixed households)*
`id, meal_plan_id, label (e.g. "adult 1", "child 1" — user-editable), target_calories, target_macros (protein/carb/fat), exclusions[] (allergies/diet)`

**meal_plans** *(per user session/generation — not a fixed library)*
`id, user_id (optional), store_ids[], household_members[] (see above — replaces single target_calories/target_macros/exclusions), combined_exclusions[] (computed union, applied to meal generation), cost_diversity_slider (1-10, 1=cheapest/most repetitive, 10=most variety), generated_meals (json: name, ingredients, sourced_deal_ids, scaled_quantity), projected_total_price, projected_price_per_meal, estimated_baseline_price (same list priced at each item's original_price instead of sale price — sourced from curated_deals, not modeled), generated_at`

**saved_recipes** *(static snapshot — not linked to curated_deals or product_url)*
`id, user_id, name, ingredients (json: name, quantity, unit — plain text, no deal/price link), macros, calories, saved_at`
— price is not tracked/updated after saving; re-adding to a new grocery list re-prices fresh against current data

**sessions** *(anonymous — created on first app open)*
`id (device/session token), agreed_to_terms_at, terms_version, linked_user_id (nullable — set once account is created)`

**users** *(created only when the user chooses to save something)*
`id, email/auth_id, agreed_to_terms_at (carried over from session), terms_version, saved_plans[], saved_recipes[], notification_prefs`

---

## 4. Tech Stack (locked so far)

- **Frontend:** React Native + Expo
- **Backend:** Supabase (Postgres + auto-generated API — faster setup for solo/small-team build)
- **Flyer data source:** structured per-region flyer feed exports (JSON + pre-cropped item images, e.g. Flipp/Wishabi format) — supersedes AI vision-parsing of downloaded flyer pages; product images are re-hosted to Supabase Storage rather than hotlinked from the feed's own CDN
- **AI extraction & meal generation:** Claude API — now scoped to reading a candidate's cutout image to confirm its real printed price, and to weekly recipe generation/tagging, rather than parsing whole flyer pages from scratch
- **Admin tool:** Airtable (free tier)
- **Store locations:** Google Places API
- **Hosting:** TBD

---

## 5. Open Questions to Resolve Next

1. ~~**Staple coverage**~~ — **RESOLVED:** small core list only at launch — pasta, rice, beans, oats, canned goods. No broader list (onions/garlic/eggs/bread/milk) for v1; can expand later once the core list proves out.
2. **Meal generation quality/variety** — resolved by the cost-vs-diversity slider (users choose their own tradeoff), but worth testing early with real flyer data whether low-diversity weeks still produce genuinely edible/coherent meals, not just "protein X five ways" with no real recipe logic behind it
3. **Deep link resolution** — how do we keep product URLs from breaking if retailers change their URL structure? **Deferred — to be decided once building**, not blocking for MVP start.
4. ~~**Multi-store pricing**~~ — **RESOLVED:** grocery list displays as one final consolidated list (not split by store), but sub-grouped by store within that list, so users can see both the full picture and which items come from where.
5. ~~**Sparse deal weeks**~~ — **RESOLVED:** if the criteria can't be met (e.g. a $2/meal target isn't achievable this week), show an honest empty state rather than silently degrading quality — e.g. "we couldn't hit $2/meal with this week's deals — try adjusting your budget or diversity slider." Same honesty principle as the landing page's empty states (section 2.1).
6. ~~**Serving scaling math**~~ — **RESOLVED:** sum household calorie/macro targets, scale the shared recipe to that combined total (not per-person granular splitting within one dish).
7. ~~**"Best Deals" vs. "Worth It" thresholds**~~ — **RESOLVED (starting point):** rough guess to launch with — 40%+ discount = "Best Deals", 15–39% = "Worth It", below 15% not featured on landing page (still available in full Deal Browse). Revisit once real weekly flyer data shows what's actually typical/achievable.
8. ~~**How is `original_price` captured without live scraping?**~~ — **RESOLVED:** a structured per-region flyer data feed (JSON + pre-cropped item images) replaces manual PDF screenshotting entirely. The feed's own `discount` field is unreliable on its own (a rounded percent that sometimes reflects an unrelated comparison, e.g. two product variants rather than a real markdown), so `original_price` is confirmed by reading the actual printed price off each candidate's cutout image — never inferred backward from `price` and `discount` alone.
9. ~~**Weekly deals data lifecycle**~~ — **RESOLVED:** the Airtable staging table and `curated_deals` both wipe and replace weekly (deals are this-week-only). `recipes` is the opposite — persistent and reused, with only its `deal_tags` refreshed weekly against the new `curated_deals`. A recipe with no currently-active deal tags stops surfacing in the Meal Plan Engine until an ingredient is on sale again.
10. **Zone resolver implementation** — still open. Confirmed direction: add a `zone` field to Airtable/`curated_deals` (multiple regional flyer variants per chain now exist), and resolve a user's zone per chain from location data the app already has, most likely via a small static lookup (postal-code-prefix or city → zone) rather than a live service, since zone boundaries are manually researched rather than API-derivable. Exact lookup mechanism (a dedicated reference table vs. a hardcoded mapping in the ingestion script) not yet decided. Recipes stay pinned to one canonical "core" zone per chain regardless (kept zone-agnostic, shared across all users); Best Deals and live grocery pricing should be zone-accurate per user.
11. ~~**Is "has a `discount` value" the right candidate filter?**~~ — **RESOLVED (per-chain, not universal):** no. Two findings from the same week's data, in opposite directions:
    - **False negatives within a chain that normally works:** a Real Canadian Superstore item (Nutella) was a genuine markdown sitting in the "no discount" bucket — `discount` absent didn't mean "not a deal," just "not flagged by the feed this time." Caught only by manually sampling the no-discount bucket, not by trusting the filter.
    - **A whole chain the filter misses entirely:** T&T's feed populates `discount` on zero items, for every item, every week — yet the flyer is full of real markdowns, just encoded as tile text instead: multi-buy pricing (`"2/$15.97 or $9.59/ea"` — `price` in the feed is the *multi-buy total*, not a per-unit price) and tiered pricing (`Special Offer $19.97` vs `Member Price $15.97` — `price` is the lower Member tier). Neither pattern touches the `discount` field at all. A one-time manual pass over T&T's full candidate pool (133 priced items) found 43 real deals this way, all otherwise invisible to the filter.

    Net: "has both `price` and `discount`" is a fast, reliable *shortcut* for chains where the feed happens to populate it well, not a general definition of "deal." The general definition is closer to *appears in this week's flyer with a genuine price comparison* (a struck-through regular price, a multi-buy split, or a tiered price) — `discount` is just the one chain-common shape of that comparison, not the only shape. Still open as an implementation task: teach the ingestion script to detect T&T's two tile patterns (likely via `text_areas` OCR, same field that also carries Walmart's price-tag text) so this doesn't stay a manual pass every week.
12. ~~**Can a recipe claim deal credit for a fraction of a package?**~~ — **RESOLVED: no.** A recipe's `deal_tags` should only credit an ingredient when the recipe's own quantity represents the *whole* package as sold (e.g. a 6-pack of chicken breasts becomes a recipe that serves 12, scaled up — never a recipe that quietly uses 2 of the 6 and leaves the rest unaccounted for). Leaving a fraction unused defeats the app's actual purpose: helping someone use up what they bought on sale, not strand part of it.
    - When the deal item genuinely *can* be scaled to a natural full-package recipe (a 30-count box of pizza pops, a 20-pack of corn dogs, a whole bottle of Miracle Whip in a big-batch potato salad), scale the recipe up — bigger `servings`, not a fabricated use of the leftover.
    - When it can't be scaled naturally because the item is a genuine bulk pantry staple used in small amounts across many *different* dishes (rice, cooking oil, condiments, concentrated pastes like soybean/miso paste) — don't force it into one recipe's full-package math. Instead, name the ingredient generically in the recipe (e.g. "Rice", not "Tilda parboiled rice") so it deliberately does **not** pick up deal credit, and let the specific deal stand on its own in Best Deals instead. This isn't a special case in the matching code — it falls out naturally, since `refresh_recipe_deal_tags` only tags an ingredient whose name contains the deal's brand-specific words (see item 11); a generic name simply doesn't match.
    - Distinguishing the two: is the deal item essentially *eaten as itself*, repeated across servings of the same preparation (pizza pops, corn dogs, cereal, trail mix, potato salad)? Scale it up. Is it a *supporting component* of a dish built around something else (rice in a kabob bowl, mayo in a sandwich, sausage as one ingredient in a mac & cheese)? Genericize it instead.
    - Applied retroactively during this pass: fixed 7 new recipes that had fragmented a package (Antipasto Pizza, Classic Potato Salad, Spring Roll & Egg Roll Platter, Honey Corn Flake Breakfast Bowl, Pizza Pops with Side Salad, Corn Dogs with Coleslaw, and Macadamia Nut & Spinach Salad — the last one redesigned entirely as Macadamia Nut Trail Mix, since forcing a whole 500g nut jar into one fresh, perishable spinach salad didn't make sense at any serving count), plus genericized 9 ingredient references in pre-existing recipes that were claiming credit for a small portion of a much larger package (rice, mayonnaise, smoked sausage, watermelon, imitation crab sticks, veggie straws). Net effect: several recipes whose *only* deal credit was one of these fractional ingredients dropped out of Meals entirely — the correct outcome, not a bug.

---

*Draft v2 — all initial open questions resolved. Living document, update as new decisions come up during build.*
