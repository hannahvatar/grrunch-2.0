-- The single-word "fresh|frozen" exclusion guard (added in
-- 20260801020000 to stop "Frozen corn" collapsing to a bare "corn" that
-- would match any ingredient) also caught "Dry or fresh pasta" -- the
-- ONLY "fresh"-containing entry in statcan_reference_prices, and unlike
-- every "Frozen X" entry it isn't a narrow variant, it's a genuinely
-- generic, trustworthy reference ("works for either dry or fresh
-- pasta"). Excluding it silently blocked ALL pasta price matching
-- (Spaghetti, Pasta, any dry pasta shape) with no real protective
-- benefit, since no other "Fresh X"-only entries exist to guard against.
-- Dropping "fresh" from the guard, keeping "frozen".

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

drop function if exists public.debug_staple_match(text, text, text);
drop function if exists public.debug_staple_match_v2(text);
