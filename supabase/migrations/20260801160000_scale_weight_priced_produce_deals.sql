-- Produce Reference Gap items are real deals and must keep full deal-tile
-- treatment (image/store/discount badge) -- see architecture.md item 14.
-- But some of them (e.g. "GREEN, GREY OR YELLOW ZUCCHINI", unit "1 lbs")
-- are priced per weight, not per discrete package like "1 bunch" Kale or
-- unit-less "head" Cauliflower. The existing deal-match branch always
-- credited the deal's flat price/original_price regardless of the
-- recipe's actual stated quantity -- correct for discrete units, but wrong
-- for a per-weight rate: crediting the full $1.99/lb as if "1 Zucchini"
-- necessarily weighs exactly 1 lb.
--
-- Fix: once a deal match is found, look up its produce_reference_prices
-- row (same "Item Name" string in both tables, see
-- scripts/sync_weekly_deals.py resolve_produce_gaps) for its unit. If that
-- unit is a per-weight rate (lb/lbs/kg/kilogram/pound) and not a discrete
-- unit (bunch/unit/bag/pack/head/crown/each), scale both price and
-- original_price to the recipe's actual quantity via the existing
-- scale_reference_price(), and mark quantity_estimated so the grocery
-- list's existing "*Quantity is estimated. See store" disclaimer applies
-- (appropriate -- a scaled weight portion is inherently an estimate).
-- discount_pct is left computed from the raw unscaled price ratio, which
-- is mathematically identical under proportional scaling. Discrete units
-- (no produce_reference_prices match, or a match whose unit isn't a
-- weight unit) keep the original flat-credit behavior unchanged.
create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
security definer
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  staple record;
  new_tags jsonb;
  ing_words text[];
  alias_ing_words text[];
  deal_words text[];
  staple_words text[];
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_score int;
  score int;
  scaled numeric;
  produce_unit text;
  tag_price numeric;
  tag_original_price numeric;
  tag_estimated boolean;
  scaled_price numeric;
  scaled_original numeric;
begin
  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

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
          select unit into produce_unit
          from public.produce_reference_prices
          where ingredient_name = deal.item_name
          limit 1;

          tag_price := deal.price;
          tag_original_price := deal.original_price;
          tag_estimated := false;

          if produce_unit is not null
             and produce_unit ~* '\y(lb|lbs|kg|kilogram|pound)\y'
             and produce_unit !~* '\y(bunch|unit|bag|pack|head|crown|each)\y'
          then
            scaled_price := public.scale_reference_price(
              ing->>'quantity', ing->>'unit', ing->>'name', deal.price, produce_unit
            );
            scaled_original := public.scale_reference_price(
              ing->>'quantity', ing->>'unit', ing->>'name', deal.original_price, produce_unit
            );
            if scaled_price is not null and scaled_original is not null then
              tag_price := scaled_price;
              tag_original_price := scaled_original;
              tag_estimated := true;
            end if;
          end if;

          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'discount_pct', round((1 - deal.price / deal.original_price) * 100),
            'quantity_estimated', tag_estimated
          );
          total := total + tag_price;
          matched := true;
          exit;
        end if;
      end loop;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_score := -1;
        alias_ing_words := public.staple_alias_words(ing_words);

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
          then
            score := public.reference_match_score(staple_words, alias_ing_words);
            if score is not null and score > best_staple_score then
              best_staple_price := staple.avg_price;
              best_staple_unit := staple.unit;
              best_staple_score := score;
            end if;
          end if;
        end loop;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit from public.produce_reference_prices
          loop
            staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
            then
              score := public.reference_match_score(staple_words, alias_ing_words);
              if score is not null and score > best_staple_score then
                best_staple_price := staple.avg_price;
                best_staple_unit := staple.unit;
                best_staple_score := score;
              end if;
            end if;
          end loop;
        end if;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit
            from public.staple_reference_prices
            where checked_by <> 'ai_estimated'
          loop
            staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
            then
              score := public.reference_match_score(staple_words, alias_ing_words);
              if score is not null and score > best_staple_score then
                best_staple_price := staple.avg_price;
                best_staple_unit := staple.unit;
                best_staple_score := score;
              end if;
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
          price = case when rec.servings > 0 then round(total / rec.servings, 2) else total end
      where id = rec.id;
  end loop;
end;
$$;

select public.refresh_recipe_deal_tags();
