-- The grocery list can now show a real dollar figure beside deal-backed
-- items: the advertised flyer price, not just the discount percent.
-- (Generic-staple pricing -- rice, butter, onions, etc. -- is matched
-- client-side against staple_reference_prices instead of here, since
-- that data doesn't rotate weekly and the matching is easier to verify
-- in the app than in a Postgres function neither of us can step through.)

create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  new_tags jsonb;
  ing_words text[];
  deal_words text[];
begin
  for rec in select id, ingredients from public.recipes loop
    new_tags := '[]'::jsonb;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');

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
          exit; -- first match wins, one tag per ingredient
        end if;
      end loop;
    end loop;

    update public.recipes set deal_tags = new_tags where id = rec.id;
  end loop;
end;
$$;

comment on column public.recipes.deal_tags is
  'Array of {name, discount_pct, price, original_price, store, image_url, quantity_estimated} for each ingredient sourced from a real curated_deals item -- price/original_price/discount_pct all snapshotted from that same deal, never modeled. quantity_estimated is true when the deal''s package size was assumed (Airtable Estimated quantity) rather than stated on the flyer (Displayed quantity).';

select public.refresh_recipe_deal_tags();
