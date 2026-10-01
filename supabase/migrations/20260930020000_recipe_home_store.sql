-- Recipe home store (Anabelle, 2026-09-30). When the same ingredient is
-- approved at several chains (onions, carrots...), refresh_recipe_deal_tags
-- picks the deal from the recipe's home store -- the chain with deals for
-- the most of its ingredients -- when it costs at most 10% or 50 cents
-- more (whichever is bigger) for the amount the recipe uses; otherwise
-- the cheaper deal wins.
-- No cap on stores per recipe. Otherwise identical to the live function
-- (20260918010000_weekly_publish.sql).

-- What a deal costs for THIS recipe's amount (the part the price per
-- serving counts) -- compares deals priced in different units fairly
-- ($/lb vs a 450 g pack), unlike their raw prices.
create or replace function public.deal_cost_for(
  p_price numeric, p_original_price numeric, p_price_unit public.deal_price_unit, p_package_weight_g numeric,
  p_package_weight_g_source text, p_fragment_by_weight boolean, p_quantity_estimated boolean,
  p_quantity text, p_unit text, p_ing_name text, p_bundle_count integer, p_package_volume_ml numeric
) returns numeric
language sql
stable
as $$
  select p.tag_contribution
  from public.compute_deal_tag_pricing(
    p_price, p_original_price, p_price_unit, p_package_weight_g, p_package_weight_g_source,
    p_fragment_by_weight, p_quantity_estimated, p_quantity, p_unit, p_ing_name, p_bundle_count, p_package_volume_ml
  ) p;
$$;

-- Whether a candidate deal should replace the current best one for the
-- same ingredient (equal match specificity). The recipe's home store wins
-- when it costs about the same for the amount used -- at most 10% or 50
-- cents more, whichever is bigger (an onion 21 cents dearer still follows
-- the home store) -- but a clearly cheaper deal elsewhere still wins ("we are still very price
-- sensitive"). Otherwise: lower cost.
create or replace function public.prefer_deal(
  p_new_chain text, p_best_chain text, p_home_store text, p_new_cost numeric, p_best_cost numeric
) returns boolean
language sql
immutable
as $$
  select case
    when p_new_cost is null then false
    when p_best_cost is null then true
    when coalesce(p_new_chain = p_home_store, false) and not coalesce(p_best_chain = p_home_store, false)
      then p_new_cost <= p_best_cost + greatest(0.50, p_best_cost * 0.10)
    when coalesce(p_best_chain = p_home_store, false) and not coalesce(p_new_chain = p_home_store, false)
      then p_new_cost + greatest(0.50, p_new_cost * 0.10) < p_best_cost
    else p_new_cost < p_best_cost
  end;
$$;

CREATE OR REPLACE FUNCTION public.refresh_recipe_deal_tags(p_published boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  rec record;
  ing jsonb;
  deal record;
  best_deal record;
  best_deal_words int;
  staple record;
  new_tags jsonb;
  ing_words text[];
  alias_ing_words text[];
  keyword text;
  keyword_words text[];
  best_keyword_words int;
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
  tag_price numeric;
  tag_original_price numeric;
  tag_estimated boolean;
  tag_price_estimated boolean;
  tag_contribution numeric;
  new_price numeric;
  matched_deal_ids uuid[] := '{}';
  home_store text;
  cost_new numeric;
  cost_best numeric;
begin
  drop table if exists deal_cache;
  drop table if exists staple_cache;

  create temp table deal_cache on commit drop as
  select id, item_name, chain_name, image_url, price, original_price, product_url,
         price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
         quantity_estimated, original_price_source, bundle_count, package_volume_ml,
         keyword_matches,
         public.normalize_words(item_name) as deal_words
  from public.curated_deals
  where status = 'approved' and usage <> 'deals' and published = p_published;

  create temp table staple_cache on commit drop as
  select 1 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.statcan_reference_prices
  union all
  select 2 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.produce_reference_prices
  union all
  select 3 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.staple_reference_prices
  where checked_by <> 'ai_estimated';

  update public.curated_deals set used_in_recipe = false
    where used_in_recipe = true and published = p_published;

  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    -- The recipe's home store: the chain with deals for the most of its
    -- ingredients. When the same ingredient is on sale at several chains,
    -- the home store's deal wins over a slightly cheaper one elsewhere, so
    -- one trip covers more of the recipe. No limit on how many stores a
    -- recipe uses -- an item only one chain has on sale still comes from
    -- that chain (Anabelle, 2026-09-30: "Don't limit stores as we are still
    -- very price sensitive. But between two stores e.g. using onions, [use]
    -- the prominent store of the recipe").
    select s.chain_name into home_store from (
      select d.chain_name, count(distinct i.ord) as n
      from jsonb_array_elements(rec.ingredients) with ordinality as i(val, ord)
      join deal_cache d on (
        (array_length(d.deal_words, 1) > 0 and d.deal_words <@ public.normalize_words(i.val->>'name'))
        or (d.keyword_matches is not null and exists (
          select 1 from unnest(d.keyword_matches) k
          where array_length(public.normalize_words(k), 1) > 0
            and public.words_loosely_subset(public.normalize_words(k), public.normalize_words(i.val->>'name'))
        ))
      )
      group by d.chain_name
      order by n desc, d.chain_name
      limit 1
    ) s;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_deal_words := 0;

      for deal in select * from deal_cache loop
        if array_length(deal.deal_words, 1) > 0 and deal.deal_words <@ ing_words then
          if array_length(deal.deal_words, 1) > best_deal_words then
            best_deal := deal;
            best_deal_words := array_length(deal.deal_words, 1);
          -- Tie-break at equal specificity: the home store first, then the
          -- lower price. A genuine elsif, not an OR in the if above -- see
          -- 20260914020000.
          elsif best_deal_words > 0 and array_length(deal.deal_words, 1) = best_deal_words
                and public.prefer_deal(deal.chain_name, best_deal.chain_name, home_store,
                  public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                    deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                    ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml),
                  public.deal_cost_for(best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
                    best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                    ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml)) then
            best_deal := deal;
          end if;
        end if;
      end loop;

      if best_deal_words > 0 then
        select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
          into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
        from public.compute_deal_tag_pricing(
          best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
          best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
          ing->>'quantity', ing->>'unit', ing->>'name',
          best_deal.bundle_count, best_deal.package_volume_ml
        ) p;

        if tag_price is not null then
          matched := true;
          matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', best_deal.chain_name,
            'image_url', best_deal.image_url,
            'product_url', best_deal.product_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'raw_price', best_deal.price,
            'raw_original_price', best_deal.original_price,
            'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', best_deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', best_deal.fragment_by_weight,
            'package_weight_g', best_deal.package_weight_g,
            'price_unit', best_deal.price_unit,
            'deal_item_name', best_deal.item_name,
            'bundle_count', best_deal.bundle_count,
            'package_volume_ml', best_deal.package_volume_ml
          );
          total := total + tag_contribution;
        end if;
      end if;

      if not matched then
        best_deal_words := 0;
        best_keyword_words := 0;

        for deal in
          select * from deal_cache
          where keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if array_length(keyword_words, 1) > 0
               and public.words_loosely_subset(keyword_words, ing_words)
            then
              if array_length(keyword_words, 1) > best_keyword_words then
                best_deal := deal;
                best_keyword_words := array_length(keyword_words, 1);
              elsif best_keyword_words > 0 and array_length(keyword_words, 1) = best_keyword_words
                    and public.prefer_deal(deal.chain_name, best_deal.chain_name, home_store,
                      public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                        deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                        ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml),
                      public.deal_cost_for(best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
                        best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                        ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml)) then
                best_deal := deal;
              end if;
            end if;
          end loop;
        end loop;

        if best_keyword_words > 0 then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
            best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_deal.bundle_count, best_deal.package_volume_ml
          ) p;

          if tag_price is not null then
            matched := true;
            matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', best_deal.chain_name,
              'image_url', best_deal.image_url,
              'product_url', best_deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'raw_price', best_deal.price,
              'raw_original_price', best_deal.original_price,
              'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', best_deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', best_deal.fragment_by_weight,
              'package_weight_g', best_deal.package_weight_g,
              'price_unit', best_deal.price_unit,
              'deal_item_name', best_deal.item_name,
              'bundle_count', best_deal.bundle_count,
              'package_volume_ml', best_deal.package_volume_ml
            );
            total := total + tag_contribution;
          end if;
        end if;
      end if;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;
        alias_ing_words := public.staple_alias_words(ing_words);

        for staple in select * from staple_cache order by tier_rank loop
          if array_length(staple.staple_words, 1) > 0
             and not (array_length(staple.staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple.staple_words <@ alias_ing_words
             and array_length(staple.staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple.staple_words, 1);
          end if;
        end loop;

        if best_staple_price is not null then
          scaled := public.scale_reference_price(
            coalesce(ing->>'price_quantity', ing->>'quantity'),
            coalesce(ing->>'price_unit', ing->>'unit'),
            ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            total := total + scaled;
          end if;
        end if;
      end if;
    end loop;

    new_price := case when rec.servings > 0 then round(total / rec.servings, 2) else round(total, 2) end;
    if p_published then
      update public.recipes set deal_tags = new_tags, price = new_price where id = rec.id;
    else
      update public.recipes set draft_deal_tags = new_tags, draft_price = new_price where id = rec.id;
    end if;
  end loop;

  if array_length(matched_deal_ids, 1) > 0 then
    update public.curated_deals set used_in_recipe = true where id = any(matched_deal_ids);
  end if;
end;
$function$;

alter function public.refresh_recipe_deal_tags(boolean) security definer;
