-- recipes.price was a single AI-guessed per-serving number set once at
-- creation time, entirely disconnected from the real deal/staple prices
-- now shown next to each ingredient in the grocery list -- so the two
-- numbers stopped reconciling the moment itemized pricing shipped (a
-- recipe's displayed line items could sum to $18+ while the "Total" still
-- showed a stale $4/serving guess from before that ingredient was ever
-- checked against a real price).
--
-- Fix: fold price computation into the same automated pass that builds
-- deal_tags, using the exact same two data sources already driving the
-- per-item display -- real curated_deals price for matched ingredients,
-- staple_reference_prices for everything else that matches a generic
-- staple, nothing added for ingredients that match neither (consistent
-- with never inventing a number the app itself can't show a source for).

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
  best_staple_words int;
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
        best_staple_words := 0;

        for staple in
          select ingredient_name, avg_price from public.staple_reference_prices
        loop
          staple_words := public.normalize_words(staple.ingredient_name);
          if array_length(staple_words, 1) > 0
             and staple_words <@ ing_words
             and array_length(staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_words := array_length(staple_words, 1);
          end if;
        end loop;

        if best_staple_price is not null then
          total := total + best_staple_price;
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

comment on column public.recipes.price is
  'Per-serving price, computed automatically by refresh_recipe_deal_tags as (sum of each ingredient''s real deal price or staple reference price) / servings -- the same two data sources already shown per ingredient in the grocery list, so this total always reconciles with what a user can add up themselves. Never a standalone estimate.';

select public.refresh_recipe_deal_tags();
