-- Anabelle's fix for a real gap: recipe-to-deal matching is exact-word
-- against a deal's actual flyer name (refresh_recipe_deal_tags,
-- deal_words <@ ing_words), so a recipe built around "Prime raised
-- without antibiotics boneless skinless chicken breasts" only
-- re-matches a FUTURE week's chicken breast deal if that deal's own
-- wording happens to be a subset of this exact phrase -- a different
-- brand (e.g. "Western Family Boneless Skinless Chicken Breasts")
-- won't, since "western"/"family" aren't in the recipe's ingredient
-- text. Deliberate by design (refresh_recipe_deal_tags' own comment:
-- "No brand-substitution guessing"), but it means a recipe silently
-- loses its deal tag whenever the exact flyer wording shifts, even for
-- what's obviously the same category of product.
--
-- keyword_matches is a human-curated escape hatch, not a replacement:
-- a short list of generic category phrases (e.g. "chicken breasts",
-- "boneless skinless chicken") assigned per deal during weekly
-- Airtable review. A recipe ingredient matches a deal if EITHER the
-- exact-name check passes (unchanged, still checked first) OR any one
-- of the deal's keywords has all its words present in the ingredient's
-- name. Since this only ever checks the keyword's own words (never the
-- deal's brand-specific name) against the ingredient, any number of
-- differently-branded deals across different weeks can share the same
-- keyword and all match the same recipe -- exactly what makes this
-- solve the problem. Deals with no keywords assigned behave exactly as
-- before (specialty/branded items like Boursin cheese should usually
-- stay unkeyworded, so they keep matching only their own exact name).
alter table public.curated_deals
  add column keyword_matches text[] not null default '{}';

comment on column public.curated_deals.keyword_matches is
  'Human-curated generic category phrases (e.g. "chicken breasts") assigned during weekly Airtable review -- a recipe ingredient matches this deal if any keyword''s words are all present in the ingredient''s name, independent of the deal''s own brand-specific wording. Empty by default -- most deals, especially specialty/branded items, should stay unkeyworded and match only their exact name.';

-- Strips a single trailing 's' -- every word normalize_words() keeps is
-- already length > 3, so this never mangles a short word down to
-- something meaningless. Used only by the keyword-matching fallback
-- below so a keyword like "chicken breast" and a recipe ingredient
-- saying "chicken breasts" (or vice versa) are treated as the same
-- word without whoever's tagging a deal having to remember to create
-- both singular and plural versions of every keyword -- a real,
-- repeating failure mode otherwise, since matching is exact-word
-- everywhere else in this schema. Deliberately NOT applied to the
-- primary exact-deal-name match or the staple/produce matching --
-- those stay exactly as validated, this is scoped to the new fallback
-- only.
create or replace function public.singularize(word text)
returns text
language sql
immutable
as $$
  select case when right(word, 1) = 's' then left(word, length(word) - 1) else word end;
$$;

-- True if every word in `needle` has a match in `haystack`, comparing
-- loosely (exact, or equal once singularize()'d) rather than the exact
-- string equality the native `<@` array-subset operator requires.
create or replace function public.words_loosely_subset(needle text[], haystack text[])
returns boolean
language plpgsql
immutable
as $$
declare
  n text;
  h text;
  found boolean;
begin
  if needle is null or array_length(needle, 1) is null then
    return false;
  end if;
  foreach n in array needle loop
    found := false;
    foreach h in array haystack loop
      if n = h or public.singularize(n) = public.singularize(h) then
        found := true;
        exit;
      end if;
    end loop;
    if not found then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  staple record;
  new_tags jsonb;
  ing_words text[];
  deal_words text[];
  keyword text;
  keyword_words text[];
  staple_words text[];
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
  ing_ua public.unit_amount;
  package_count numeric;
  tag_price numeric;
  tag_original_price numeric;
begin
  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;

      -- Pass 1: exact match only, across EVERY approved deal, to
      -- completion, before any keyword is ever considered. This
      -- ordering is load-bearing, confirmed the hard way: interleaving
      -- the keyword check into the same per-deal loop let an unrelated
      -- deal's keyword win ahead of a different deal's real exact
      -- match purely from arbitrary row order -- "Marcangelo Chicken
      -- Breast Souvlaki kabobs" briefly got mis-tagged with the Prime
      -- boneless chicken breast deal's price, because "chicken breast"
      -- is a literal (if coincidental) substring of the kabob
      -- product's own name, and Postgres happened to return that deal
      -- row before Marcangelo's. A full exact-match pass first
      -- guarantees a real exact match always wins regardless of row
      -- order or keyword collisions.
      for deal in
        select item_name, chain_name, image_url, price, original_price
        from public.curated_deals
        where status = 'approved'
      loop
        deal_words := public.normalize_words(deal.item_name);
        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          matched := true;
          ing_ua := public.parse_unit_amount(ing->>'quantity', ing->>'unit');
          package_count := case
            when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
              then ing_ua.amount
            else 1
          end;
          tag_price := round(deal.price * package_count, 2);
          tag_original_price := round(deal.original_price * package_count, 2);
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'discount_pct', round((1 - tag_price / tag_original_price) * 100),
            'quantity_estimated', false
          );
          total := total + tag_price;
          exit;
        end if;
      end loop;

      -- Pass 2: keyword fallback -- only runs if pass 1 found nothing
      -- for this ingredient anywhere. Loose (singular/plural-tolerant)
      -- comparison against just the keyword's own words, never the
      -- deal's brand-specific name -- see words_loosely_subset(). A
      -- deal with no keywords assigned is invisible to this pass
      -- entirely, same as before this feature existed.
      if not matched then
        for deal in
          select item_name, chain_name, image_url, price, original_price, keyword_matches
          from public.curated_deals
          where status = 'approved' and keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if public.words_loosely_subset(keyword_words, ing_words) then
              matched := true;
              exit;
            end if;
          end loop;

          if matched then
            ing_ua := public.parse_unit_amount(ing->>'quantity', ing->>'unit');
            package_count := case
              when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
                then ing_ua.amount
              else 1
            end;
            tag_price := round(deal.price * package_count, 2);
            tag_original_price := round(deal.original_price * package_count, 2);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', deal.chain_name,
              'image_url', deal.image_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'discount_pct', round((1 - tag_price / tag_original_price) * 100),
              'quantity_estimated', false
            );
            total := total + tag_price;
            exit;
          end if;
        end loop;
      end if;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.normalize_words(staple.ingredient_name);
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
             and staple_words <@ ing_words
             and array_length(staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple_words, 1);
          end if;
        end loop;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit from public.produce_reference_prices
          loop
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
               and staple_words <@ ing_words
               and array_length(staple_words, 1) > best_staple_words
            then
              best_staple_price := staple.avg_price;
              best_staple_unit := staple.unit;
              best_staple_words := array_length(staple_words, 1);
            end if;
          end loop;
        end if;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit
            from public.staple_reference_prices
            where checked_by <> 'ai_estimated'
          loop
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
               and staple_words <@ ing_words
               and array_length(staple_words, 1) > best_staple_words
            then
              best_staple_price := staple.avg_price;
              best_staple_unit := staple.unit;
              best_staple_words := array_length(staple_words, 1);
            end if;
          end loop;
        end if;

        if best_staple_price is not null then
          scaled := public.scale_reference_price(
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            total := total + scaled;
          end if;
        end if;
      end if;
    end loop;

    update public.recipes
      set deal_tags = new_tags,
          price = case when rec.servings > 0 then round(total / rec.servings, 2) else round(total, 2) end
      where id = rec.id;
  end loop;
end;
$$;

comment on function public.refresh_recipe_deal_tags() is
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table. Two full passes per ingredient, in order: (1) exact name match against every approved deal (deal_words <@ ing_words) -- always checked to completion first, so a real exact match can never lose to a keyword collision regardless of row order; (2) only if pass 1 found nothing, a human-curated keyword fallback -- matches if any of a deal''s keyword_matches phrases has all its words loosely present (singular/plural-tolerant) in the ingredient''s name, letting a differently-branded future deal in the same generic category (e.g. any "chicken breasts") still match without ever guessing brand equivalence on its own. A deal-tagged ingredient credits its package price once per whole package the recipe''s stated quantity/unit calls for (parse_unit_amount, base_unit=''each'', amount>1) -- a sub-package quantity (e.g. "450 g" of a bigger pack) still credits exactly one package, since that''s what you''d actually buy. Call after every curated_deals sync (see scripts/sync-deals) or after editing a recipe''s ingredients.';

select public.refresh_recipe_deal_tags();
