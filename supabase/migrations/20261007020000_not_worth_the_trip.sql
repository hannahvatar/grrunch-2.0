-- "Not worth the trip" (Anabelle, 2026-10-07): when a recipe's deals from
-- a store other than its home store save less than $0.50 in total, drop
-- them and buy those items at the home store at regular price, so a
-- recipe doesn't send shoppers to an extra store to save a few cents.
-- Keeps SECURITY DEFINER and statement_timeout = 60s (20261002010000).
CREATE OR REPLACE FUNCTION public.refresh_recipe_deal_tags(p_published boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '60s'
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
  main_tags text[];
  fallback_tags text[];
  try_tags text[];
  tag_found boolean;
  pending jsonb;
  pending_tag jsonb;
  p jsonb;
  drop_chains text[];
  main_chain text;
begin
  drop table if exists deal_cache;
  drop table if exists staple_cache;

  create temp table deal_cache on commit drop as
  select id, item_name, chain_name, image_url, price, original_price, product_url,
         price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
         quantity_estimated, original_price_source, bundle_count, package_volume_ml,
         keyword_matches,
         public.normalize_words(item_name) as deal_words,
         public.deal_match_keys(item_name, keyword_matches) as match_keys
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
    pending := '[]'::jsonb;

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
        case when jsonb_array_length(coalesce(i.val->'match_tags', '[]'::jsonb)) > 0 then
          d.match_keys && (public.tag_keys(i.val->'match_tags') || public.tag_keys(i.val->'fallback_tags'))
        else (
        (array_length(d.deal_words, 1) > 0 and d.deal_words <@ public.normalize_words(i.val->>'name'))
        or (d.keyword_matches is not null and exists (
          select 1 from unnest(d.keyword_matches) k
          where array_length(public.normalize_words(k), 1) > 0
            and public.words_loosely_subset(public.normalize_words(k), public.normalize_words(i.val->>'name'))
        ))
        ) end
      )
      group by d.chain_name
      order by n desc, d.chain_name
      limit 1
    ) s;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_deal_words := 0;
      main_tags := public.tag_keys(ing->'match_tags');
      fallback_tags := public.tag_keys(ing->'fallback_tags');

      if coalesce(array_length(main_tags, 1), 0) > 0 then
        -- Tagged ingredient (20261006 recipe match tags): a deal matches
        -- when one of its match_keys equals one of the tags. Cheapest wins
        -- (home store tie-break via prefer_deal). Fallback tags are only
        -- tried when no main tag matches anything.
        tag_found := false;
        for pass in 1..2 loop
          try_tags := case when pass = 1 then main_tags else fallback_tags end;
          exit when tag_found or coalesce(array_length(try_tags, 1), 0) = 0;
          for deal in select * from deal_cache where match_keys && try_tags loop
            if not tag_found then
              cost_new := public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml);
              if cost_new is not null then
                best_deal := deal;
                tag_found := true;
              end if;
            elsif public.prefer_deal(deal.chain_name, best_deal.chain_name, home_store,
                public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                  deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                  ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml),
                public.deal_cost_for(best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
                  best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                  ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml)) then
              best_deal := deal;
            end if;
          end loop;
        end loop;

        if tag_found then
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
            pending_tag := jsonb_build_object(
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
            pending := pending || jsonb_build_object('tag', pending_tag, 'chain', best_deal.chain_name, 'deal_id', best_deal.id,
              'contribution', tag_contribution,
              'regular', coalesce(public.deal_cost_for(best_deal.original_price, best_deal.original_price, best_deal.price_unit,
                best_deal.package_weight_g, best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml), tag_contribution));
          end if;
        end if;
      else
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
          pending_tag := jsonb_build_object(
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
          pending := pending || jsonb_build_object('tag', pending_tag, 'chain', best_deal.chain_name, 'deal_id', best_deal.id,
              'contribution', tag_contribution,
              'regular', coalesce(public.deal_cost_for(best_deal.original_price, best_deal.original_price, best_deal.price_unit,
                best_deal.package_weight_g, best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml), tag_contribution));
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
            pending_tag := jsonb_build_object(
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
            pending := pending || jsonb_build_object('tag', pending_tag, 'chain', best_deal.chain_name, 'deal_id', best_deal.id,
              'contribution', tag_contribution,
              'regular', coalesce(public.deal_cost_for(best_deal.original_price, best_deal.original_price, best_deal.price_unit,
                best_deal.package_weight_g, best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml), tag_contribution));
          end if;
        end if;
      end if;

      end if;  -- tagged / untagged

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;
        alias_ing_words := public.staple_alias_words(ing_words);

        -- Tagged ingredient: a reference price whose name equals one of
        -- its tags wins first (e.g. `smoked sausages` -> "Smoked sausage",
        -- which the word match below misses on the plural).
        if coalesce(array_length(main_tags, 1), 0) > 0 then
          select sc.avg_price, sc.unit into best_staple_price, best_staple_unit
          from staple_cache sc
          where public.match_norm(sc.ingredient_name) = any(main_tags)
          order by sc.tier_rank
          limit 1;
        end if;

        if best_staple_price is null then
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
        end if;

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

    -- Not worth the trip (Anabelle, 2026-10-07): a store other than the
    -- recipe's home store whose deals save this recipe less than $0.50 in
    -- total is dropped. Those items are bought at regular price instead
    -- (their regular cost is what the recipe price counts) and don't show
    -- as deals. The main store is never dropped.
    -- The main store here is where the recipe actually buys the most sale
    -- items (ties: the bigger saving), decided after the deals are picked,
    -- so a recipe can never lose its main store.
    select e->>'chain' into main_chain
    from jsonb_array_elements(pending) e
    group by e->>'chain'
    order by count(*) desc, sum((e->>'regular')::numeric - (e->>'contribution')::numeric) desc, e->>'chain'
    limit 1;

    select coalesce(array_agg(x.chain), '{}') into drop_chains
    from (
      select e->>'chain' as chain,
             sum((e->>'regular')::numeric - (e->>'contribution')::numeric) as saving
      from jsonb_array_elements(pending) e
      group by e->>'chain'
    ) x
    where x.chain is distinct from main_chain and x.saving < 0.50;

    for p in select value from jsonb_array_elements(pending) loop
      if (p->>'chain') = any(drop_chains) then
        total := total + (p->>'regular')::numeric;
      else
        new_tags := new_tags || (p->'tag');
        total := total + (p->>'contribution')::numeric;
        matched_deal_ids := array_append(matched_deal_ids, (p->>'deal_id')::uuid);
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
