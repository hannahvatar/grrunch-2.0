-- Fixes a real pricing bug found while normalizing recipe serving sizes
-- (2026-08-08): refresh_recipe_deal_tags() credited a deal-tagged
-- ingredient's package price exactly once, no matter what quantity/unit
-- the recipe's ingredient line stated -- e.g. {"quantity": "2", "unit":
-- "pack"} still only added a single deal.price to fixed_total. This was
-- inconsistent with refresh_recipe_nutrition()/scale_deal_nutrient(),
-- which DOES parse the recipe's quantity and scales calories/protein by
-- however many packages the recipe actually calls for.
--
-- A quantity of LESS than one package (e.g. "450 g" of a 700g pack) is
-- unaffected and stays correct as-is -- you still have to buy the whole
-- discounted package to get 450g of it, so crediting it once is the
-- honest price. The bug was specifically when a recipe calls for MORE
-- than one package (e.g. "2 pack", "3 cans") -- nutrition would double,
-- price wouldn't.
--
-- No live recipe currently states a deal-tagged quantity above one
-- package, so this changes zero existing recipes' numbers; it just stops
-- a quantity like that from silently undercounting price the next time
-- one gets written.
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
  staple_words text[];
  matched boolean;
  fixed_total numeric;
  flexible_total numeric;
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
    fixed_total := 0;
    flexible_total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;

      for deal in
        select item_name, chain_name, image_url, price, original_price
        from public.curated_deals
        where status = 'approved'
      loop
        deal_words := public.normalize_words(deal.item_name);

        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          -- How many whole packages this ingredient line actually needs
          -- -- "2 pack"/"3 cans" parse to base_unit 'each' with amount 2
          -- or 3; anything else (a gram/mL amount of a single package,
          -- an unparseable/blank quantity) stays at exactly 1, matching
          -- the old always-credit-once behavior.
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
            -- A ratio, so scaling price and original_price by the same
            -- package_count leaves this unchanged either way -- computed
            -- from the scaled values anyway for clarity.
            'discount_pct', round((1 - tag_price / tag_original_price) * 100),
            'quantity_estimated', false
          );
          fixed_total := fixed_total + tag_price;
          matched := true;
          exit;
        end if;
      end loop;

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
            flexible_total := flexible_total + scaled;
          end if;
        end if;
      end if;
    end loop;

    update public.recipes
      set deal_tags = new_tags,
          price = case when rec.servings > 0 then round((fixed_total + flexible_total) / rec.servings, 2) else round(fixed_total + flexible_total, 2) end,
          fixed_price = round(fixed_total, 2),
          flexible_price = round(flexible_total, 2)
      where id = rec.id;
  end loop;
end;
$$;

comment on function public.refresh_recipe_deal_tags() is
  'Rebuilds deal_tags and price/fixed_price/flexible_price for every recipe from scratch against the current curated_deals table. A deal-tagged ingredient credits its package price once per whole package the recipe''s stated quantity/unit calls for (parse_unit_amount, base_unit=''each'', amount>1) -- a sub-package quantity (e.g. "450 g" of a bigger pack) still credits exactly one package, since that''s what you''d actually buy. Deterministic word-subset matching only -- no brand-substitution guessing. Call after every curated_deals sync (see scripts/sync-deals) or after editing a recipe''s ingredients.';

-- Recompute every recipe now so any future multi-package ingredient
-- benefits immediately; a no-op for every recipe today since none
-- currently state a deal-tagged quantity above one package.
select public.refresh_recipe_deal_tags();
