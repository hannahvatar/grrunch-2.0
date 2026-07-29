# Grrunch — Functional Analysis & Architecture (Draft v2)

## 1. Product Summary

Grrunch is a React Native (iOS + Android) app for BC grocery shoppers, built
around **budget-driven meal planning**. A user sets their stores, meal count,
portion/macro targets, and dietary exclusions; Grrunch's AI generates 10
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
and doesn't claim to be — recipes and portions aim to get as close as
possible to a person's stated calorie/macro needs within their budget, but
at the cost-optimized end of the spectrum this will often mean thinner
protein and vegetable portions than an ideal diet would call for. The app
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
- **User builds a household**: adds one or more people, each with their own portion targets (calories + macros) and their own exclusions (allergies, dietary restrictions)
  - e.g. a household of 4 (man, woman, 2 children) — each person gets their own profile, not one shared setting
  - Household size affects **ingredient quantities** in the final grocery list (scaled to feed everyone, not just one portion)
  - **Exclusions are combined across the household** — if any one person has a peanut allergy, peanuts are excluded from all household meals (MVP assumes shared family meals, not separately-cooked meals per person)
  - Individual calorie/macro targets are summed/averaged to size portions appropriately, but the *meal itself* stays a single shared dish per meal slot (no per-person separate meals in MVP — that's a much larger feature, flagged as post-MVP below)
- **Cost vs. diversity slider (1–10)**: user chooses where their plan sits between "cheapest possible" (1 — leans hard into whichever single protein/staple is cheapest this week, high repetition) and "most variety" (10 — rotates proteins/ingredients for interest, at a higher price-per-meal). App shows the resulting price-per-meal difference live so the tradeoff is transparent, not hidden. Meal generation must optimize primarily along this axis, not default to variety — cost-consciousness is the core value prop, so the default slider position should sit low/cost-leaning, not centered
- **Honesty disclosure (per mission framing above)**: when a plan leans heavily on cost optimization (low slider values), the app should visibly flag that protein/vegetable portions are thinner than an ideal diet, rather than presenting the plan as nutritionally complete. Grrunch is a budget tool, not a dietitian — this should be stated plainly, not buried in fine print

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
- From a generated meal, user can tap "Save" to keep the recipe (name, ingredients list, portion/macro info) for later reference
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
- No per-person separate meals — households get shared meals with combined exclusions and scaled portions, not individually customized dishes per family member (real feature, but a much bigger one — flagged for post-MVP consideration)

---

## 3. System Architecture

```
┌─────────────────────────┐
│  Weekly Flyer Sources     │  (public URLs, 5 chains — staggered per
│                            │   each chain's actual flyer refresh day)
└────────────┬─────────────┘
             │ (1) download (per-chain schedule)
             ▼
┌─────────────────────────┐
│  Ingestion Service         │
└────────────┬─────────────┘
             │ (2) AI parse
             ▼
┌─────────────────────────┐
│  AI Extraction Layer       │  candidate deals
│  (Claude API)               │  {item, price, chain}
└────────────┬─────────────┘
             │ (3) human review queue
             ▼
┌─────────────────────────┐
│  Admin Review Tool          │  approve/edit deal,
│  (Airtable, free tier)      │  attach product URL
└────────────┬─────────────┘
             │ (4) publish
             ▼
┌───────────────────────────────────────────────┐
│              Grrunch Database (Supabase)          │
│  curated_deals · staple_reference_prices · stores  │
│  meal_plans                                          │
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
| Ingestion Service | Scheduled job per chain, staggered to match each chain's actual flyer refresh day; downloads public flyer/deals pages | No login bypass, no hidden API calls — public URLs only |
| AI Extraction Layer | Reads downloaded flyer, proposes structured candidate deals | Claude API (vision or text depending on flyer format) |
| Admin Review Tool | Classify each candidate deal's usage; attach product URLs; maintain the small staple reference-price list | Airtable (free tier) — no-code, avoids build time and cost for v1. Must capture both sale price and regular/original price per deal — this pair is what powers the savings-evidence feature. `status` field superseded from a pending/approved/rejected review workflow to a usage classification: `recipes` (fetched into the recipe library), `deals` (surfaced in the app's Deals section), `both`, or `remove` |
| Recipe Generation | Generates real recipes into the persistent `recipes` table using `recipes`/`both`-tagged deal ingredients as the basis, plus manual entry for curator-authored recipes | Claude API call per generation batch, not per user session — recipes are a standing library, not regenerated per plan |
| Meal Plan Engine | Given user's macro/exclusion/budget/store inputs, selects and assembles a meal plan from the `recipes` library (falling back to on-the-fly generation only if the library can't fill a slot) | Runs server-side. Optimizes along the cost-vs-diversity slider (1–10) — low end leans into cheap staples (pasta/rice/beans) as meal bases plus whichever protein/deal is cheapest, even if repetitive; high end rotates ingredients for variety at higher cost |
| Grocery List Generator | Consolidates ingredients across chosen meals, dedupes, excludes pantry basics, sums deal prices + light staple reference prices | Core budget-projection logic |
| Grrunch Database | Stores curated deals, staple reference prices, store locations, generated meal plans | Never a scraped/live full price catalog |
| Backend API | Serves app queries: meal plan generation, grocery list, deal browse | Supabase; store location lookups via Google Places API |
| React Native App | Setup flow, meal review/swap, grocery list, deep-linking out | Expo-based per earlier decision |

### 3.2 Data Model (sketch)

**stores**
`id, chain_name, banner, address, lat, lng, hours` — populated via Google Places API

**curated_deals**
`id, chain_name, item_name, category, price, original_price, discount_pct, product_url, flyer_valid_from, flyer_valid_to, image_url (optional), status, reviewed_by, reviewed_at`
— this is now also the primary ingredient/pricing pool for meal generation. `status` in Airtable is now `recipes`/`deals`/`both`/`remove` (see 3.1) — the Supabase `deal_status` enum still reflects the older pending/approved/rejected review workflow and needs a follow-up migration once the Airtable → Supabase sync is built (deferred for now, recipe-database work took priority)

**recipes** *(persistent library — supersedes the "no persistent recipe library, generate per session" MVP decision; see 2.6)*
`id, name, ingredients (json: name, quantity, unit), instructions (json: ordered steps), category/tag, calories, protein, minutes, price (estimated per serving), source (ai_generated / manual), source_deal_ids[] (nullable — curated_deals rows the recipe was inspired by, for traceability only, not a live price link), created_at`
— ingredients are stored as plain text, decoupled from any specific week's deal (deals rotate weekly, recipes are meant to be reusable across weeks) — same "static snapshot" philosophy as saved_recipes below, just curator/AI-populated instead of user-populated

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
- **AI extraction & meal generation:** Claude API
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
6. ~~**Portion scaling math**~~ — **RESOLVED:** sum household calorie/macro targets, scale the shared recipe to that combined total (not per-person granular splitting within one dish).
7. ~~**"Best Deals" vs. "Worth It" thresholds**~~ — **RESOLVED (starting point):** rough guess to launch with — 40%+ discount = "Best Deals", 15–39% = "Worth It", below 15% not featured on landing page (still available in full Deal Browse). Revisit once real weekly flyer data shows what's actually typical/achievable.

---

*Draft v2 — all initial open questions resolved. Living document, update as new decisions come up during build.*
