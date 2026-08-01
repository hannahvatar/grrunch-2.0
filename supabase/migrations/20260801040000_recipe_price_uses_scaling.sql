-- Wires scale_reference_price() into the actual recipe pricing pass, and
-- stops trusting staple_reference_prices rows where
-- checked_by = 'ai_estimated' (see previous migration for both).
--
-- Previously every matched reference price was added to the recipe's
-- total in full, regardless of how much the recipe actually calls for --
-- "1 tbsp olive oil" got charged the same as "1 litre olive oil" would.
-- Now the matched price is scaled to the ingredient's actual quantity;
-- if the units are incompatible and can't be bridged (see
-- scale_reference_price), that ingredient contributes nothing rather
-- than a guessed number.

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
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
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
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'price', deal.price,
            'original_price', deal.original_price,
            'discount_pct', round((1 - deal.price / deal.original_price) * 100),
            'quantity_estimated', false
          );
          total := total + deal.price;
          matched := true;
          exit; -- first deal match wins, one tag per ingredient
        end if;
      end loop;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;

        -- 1. StatCan (real, sourced) first.
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

        -- 2. Human-sourced produce prices next -- covers the fresh
        -- produce items StatCan's table doesn't track.
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

        -- 3. Human-verified staple prices, only if nothing sourced
        -- matched -- ai_estimated rows are never trusted, only StatCan or
        -- an explicitly human-checked entry.
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
          price = case when rec.servings > 0 then round(total / rec.servings, 2) else total end
      where id = rec.id;
  end loop;
end;
$$;

select public.refresh_recipe_deal_tags();
