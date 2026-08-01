-- Specific dry pasta shapes (Spaghetti, Macaroni, Rigatoni, ...) all
-- price the same as StatCan's generic "Dry or fresh pasta" reference --
-- but unlike "White rice" (shares the word "rice" with "Rice"),
-- "Spaghetti" shares NO word at all with "pasta", so reference_match_score's
-- variety-descriptor fallback (item 070000) can't bridge it -- it needs a
-- real synonym map instead.
--
-- Scoped to staple-reference-price matching only (the three fallback
-- tiers in refresh_recipe_deal_tags), never deal-credit matching -- a
-- recipe naming a specific branded pasta on deal should still only match
-- that exact deal, not any pasta-shaped ingredient (architecture item 12).

create or replace function public.staple_alias_words(words text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(
    case w
      when 'spaghetti' then 'pasta'
      when 'spaghettini' then 'pasta'
      when 'macaroni' then 'pasta'
      when 'rigatoni' then 'pasta'
      when 'penne' then 'pasta'
      when 'fusilli' then 'pasta'
      when 'rotini' then 'pasta'
      when 'linguine' then 'pasta'
      when 'fettuccine' then 'pasta'
      when 'farfalle' then 'pasta'
      when 'orzo' then 'pasta'
      when 'ziti' then 'pasta'
      when 'vermicelli' then 'pasta'
      else w
    end
  ), '{}')
  from unnest(words) as w;
$$;

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
        -- Aliased only for the staple-reference-price fallback below --
        -- deal matching above stays literal.
        alias_ing_words := public.staple_alias_words(ing_words);

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
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
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
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
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
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
