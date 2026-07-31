// Monthly sync of statcan_reference_prices from Statistics Canada's free,
// open Web Data Service -- table 18-10-0245-01 "Monthly average retail
// prices for selected products", British Columbia only.
//
// Deliberately uses the vector-based JSON endpoint (getDataFromVectorsAndLatestNPeriods)
// instead of the full-table CSV/ZIP download the local dev script
// (scripts/sync_statcan_prices.py) uses -- Deno's runtime has no built-in
// zip extraction, and this endpoint returns exactly the one latest data
// point per series as plain JSON, no unzipping needed. The vector IDs
// below were extracted once from the full CSV export and are stable
// (StatCan assigns a vector ID per series for the life of the table) --
// they don't need to be re-derived each run, just periodically re-checked
// if StatCan restructures table 18-10-0245-01.
//
// Runs on Supabase's own schedule (pg_cron + pg_net, see the migration
// alongside this function) so the Supabase service_role credential this
// needs never has to leave Supabase's own environment -- it's just the
// function's standard runtime env var (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// are auto-injected into every Edge Function, no manual secret needed).

const EXCLUDED_INGREDIENTS = new Set([
  "Deodorant",
  "Toothpaste",
  "Shampoo",
  "Laundry detergent",
]);

const VECTORS: { vectorId: number; productName: string; ingredientName: string; unit: string }[] = [
  { vectorId: 1159447335, productName: "Beef stewing cuts, per kilogram", ingredientName: "Beef stewing cuts", unit: "per kilogram" },
  { vectorId: 1159447336, productName: "Beef striploin cuts, per kilogram", ingredientName: "Beef striploin cuts", unit: "per kilogram" },
  { vectorId: 1159447337, productName: "Beef top sirloin cuts, per kilogram", ingredientName: "Beef top sirloin cuts", unit: "per kilogram" },
  { vectorId: 1353834680, productName: "Beef rib cuts, per kilogram", ingredientName: "Beef rib cuts", unit: "per kilogram" },
  { vectorId: 1159447338, productName: "Ground beef, per kilogram", ingredientName: "Ground beef", unit: "per kilogram" },
  { vectorId: 1159447339, productName: "Pork loin cuts, per kilogram", ingredientName: "Pork loin cuts", unit: "per kilogram" },
  { vectorId: 1159447340, productName: "Pork rib cuts, per kilogram", ingredientName: "Pork rib cuts", unit: "per kilogram" },
  { vectorId: 1353834681, productName: "Pork shoulder cuts, per kilogram", ingredientName: "Pork shoulder cuts", unit: "per kilogram" },
  { vectorId: 1159447341, productName: "Whole chicken, per kilogram", ingredientName: "Whole chicken", unit: "per kilogram" },
  { vectorId: 1159447342, productName: "Chicken breasts, per kilogram", ingredientName: "Chicken breasts", unit: "per kilogram" },
  { vectorId: 1159447343, productName: "Chicken thigh, per kilogram", ingredientName: "Chicken thigh", unit: "per kilogram" },
  { vectorId: 1353834682, productName: "Chicken drumsticks, per kilogram", ingredientName: "Chicken drumsticks", unit: "per kilogram" },
  { vectorId: 1159447344, productName: "Bacon, 500 grams", ingredientName: "Bacon", unit: "500 grams" },
  { vectorId: 1159447345, productName: "Wieners, 400 grams", ingredientName: "Wieners", unit: "400 grams" },
  { vectorId: 1458870259, productName: "Salmon, per kilogram", ingredientName: "Salmon", unit: "per kilogram" },
  { vectorId: 1458870261, productName: "Shrimp, 300 grams", ingredientName: "Shrimp", unit: "300 grams" },
  { vectorId: 1353834683, productName: "Canned salmon, 213 grams", ingredientName: "Canned salmon", unit: "213 grams" },
  { vectorId: 1159447346, productName: "Canned tuna, 170 grams", ingredientName: "Canned tuna", unit: "170 grams" },
  { vectorId: 1458870252, productName: "Meatless burgers, 226 grams", ingredientName: "Meatless burgers", unit: "226 grams" },
  { vectorId: 1159447347, productName: "Milk, 1 litre", ingredientName: "Milk", unit: "1 litre" },
  { vectorId: 1159447348, productName: "Milk, 2 litres", ingredientName: "Milk", unit: "2 litres" },
  { vectorId: 1159447349, productName: "Milk, 4 litres", ingredientName: "Milk", unit: "4 litres" },
  { vectorId: 1458870262, productName: "Soy milk, 1.89 litres", ingredientName: "Soy milk", unit: "1.89 litres" },
  { vectorId: 1458870253, productName: "Nut milk, 1.89 litres", ingredientName: "Nut milk", unit: "1.89 litres" },
  { vectorId: 1159447350, productName: "Cream, 1 litre", ingredientName: "Cream", unit: "1 litre" },
  { vectorId: 1159447351, productName: "Butter, 454 grams", ingredientName: "Butter", unit: "454 grams" },
  { vectorId: 1458870251, productName: "Margarine, 907 grams", ingredientName: "Margarine", unit: "907 grams" },
  { vectorId: 1159447352, productName: "Block cheese, 500 grams", ingredientName: "Block cheese", unit: "500 grams" },
  { vectorId: 1159447353, productName: "Yogurt, 500 grams", ingredientName: "Yogurt", unit: "500 grams" },
  { vectorId: 1159447354, productName: "Eggs, 1 dozen", ingredientName: "Eggs", unit: "1 dozen" },
  { vectorId: 1159447355, productName: "Apples, per kilogram", ingredientName: "Apples", unit: "per kilogram" },
  { vectorId: 1159447356, productName: "Oranges, per kilogram", ingredientName: "Oranges", unit: "per kilogram" },
  { vectorId: 1159447357, productName: "Oranges, 1.36 kilograms", ingredientName: "Oranges", unit: "1.36 kilograms" },
  { vectorId: 1159447358, productName: "Bananas, per kilogram", ingredientName: "Bananas", unit: "per kilogram" },
  { vectorId: 1159447359, productName: "Pears, per kilogram", ingredientName: "Pears", unit: "per kilogram" },
  { vectorId: 1159447360, productName: "Lemons, unit", ingredientName: "Lemons", unit: "unit" },
  { vectorId: 1353834684, productName: "Limes, unit", ingredientName: "Limes", unit: "unit" },
  { vectorId: 1159447361, productName: "Grapes, per kilogram", ingredientName: "Grapes", unit: "per kilogram" },
  { vectorId: 1159447362, productName: "Cantaloupe, unit", ingredientName: "Cantaloupe", unit: "unit" },
  { vectorId: 1458870264, productName: "Strawberries, 454 grams", ingredientName: "Strawberries", unit: "454 grams" },
  { vectorId: 1159447363, productName: "Avocado, unit", ingredientName: "Avocado", unit: "unit" },
  { vectorId: 1159447364, productName: "Potatoes, 4.54 kilograms", ingredientName: "Potatoes", unit: "4.54 kilograms" },
  { vectorId: 1353834685, productName: "Potatoes, per kilogram", ingredientName: "Potatoes", unit: "per kilogram" },
  { vectorId: 1353834686, productName: "Sweet potatoes, per kilogram", ingredientName: "Sweet potatoes", unit: "per kilogram" },
  { vectorId: 1159447365, productName: "Tomatoes, per kilogram", ingredientName: "Tomatoes", unit: "per kilogram" },
  { vectorId: 1159447366, productName: "Cabbage, per kilogram", ingredientName: "Cabbage", unit: "per kilogram" },
  { vectorId: 1159447367, productName: "Carrots, 1.36 kilograms", ingredientName: "Carrots", unit: "1.36 kilograms" },
  { vectorId: 1159447368, productName: "Onions, per kilogram", ingredientName: "Onions", unit: "per kilogram" },
  { vectorId: 1159447369, productName: "Onions, 1.36 kilograms", ingredientName: "Onions", unit: "1.36 kilograms" },
  { vectorId: 1159447370, productName: "Celery, unit", ingredientName: "Celery", unit: "unit" },
  { vectorId: 1159447371, productName: "Cucumber, unit", ingredientName: "Cucumber", unit: "unit" },
  { vectorId: 1159447372, productName: "Mushrooms, 227 grams", ingredientName: "Mushrooms", unit: "227 grams" },
  { vectorId: 1353834687, productName: "Iceberg lettuce, unit", ingredientName: "Iceberg lettuce", unit: "unit" },
  { vectorId: 1353834688, productName: "Romaine lettuce, unit", ingredientName: "Romaine lettuce", unit: "unit" },
  { vectorId: 1159447373, productName: "Broccoli, unit", ingredientName: "Broccoli", unit: "unit" },
  { vectorId: 1159447374, productName: "Peppers, per kilogram", ingredientName: "Peppers", unit: "per kilogram" },
  { vectorId: 1458870263, productName: "Squash, per kilogram", ingredientName: "Squash", unit: "per kilogram" },
  { vectorId: 1458870258, productName: "Salad greens, 142 grams", ingredientName: "Salad greens", unit: "142 grams" },
  { vectorId: 1353834689, productName: "Frozen french fried potatoes, 750 grams", ingredientName: "Frozen french fried potatoes", unit: "750 grams" },
  { vectorId: 1353834690, productName: "Frozen green beans, 750 grams", ingredientName: "Frozen green beans", unit: "750 grams" },
  { vectorId: 1353834691, productName: "Frozen broccoli, 500 grams", ingredientName: "Frozen broccoli", unit: "500 grams" },
  { vectorId: 1353834692, productName: "Frozen corn, 750 grams", ingredientName: "Frozen corn", unit: "750 grams" },
  { vectorId: 1353834693, productName: "Frozen mixed vegetables, 750 grams", ingredientName: "Frozen mixed vegetables", unit: "750 grams" },
  { vectorId: 1353834694, productName: "Frozen peas, 750 grams", ingredientName: "Frozen peas", unit: "750 grams" },
  { vectorId: 1458870245, productName: "Frozen pizza, 390 grams", ingredientName: "Frozen pizza", unit: "390 grams" },
  { vectorId: 1458870246, productName: "Frozen spinach, 300 grams", ingredientName: "Frozen spinach", unit: "300 grams" },
  { vectorId: 1458870247, productName: "Frozen strawberries, 600 grams", ingredientName: "Frozen strawberries", unit: "600 grams" },
  { vectorId: 1353834695, productName: "White bread, 675 grams", ingredientName: "White bread", unit: "675 grams" },
  { vectorId: 1458870244, productName: "Flatbread and pita, 500 grams", ingredientName: "Flatbread and pita", unit: "500 grams" },
  { vectorId: 1458870242, productName: "Crackers and crisp breads, 200 grams", ingredientName: "Crackers and crisp breads", unit: "200 grams" },
  { vectorId: 1458870241, productName: "Cookies and sweet biscuits, 300 grams", ingredientName: "Cookies and sweet biscuits", unit: "300 grams" },
  { vectorId: 1353834696, productName: "Dry or fresh pasta, 500 grams", ingredientName: "Dry or fresh pasta", unit: "500 grams" },
  { vectorId: 1458870236, productName: "Brown rice, 900 grams", ingredientName: "Brown rice", unit: "900 grams" },
  { vectorId: 1458870267, productName: "White rice, 2 kilograms", ingredientName: "White rice", unit: "2 kilograms" },
  { vectorId: 1353834697, productName: "Cereal, 400 grams", ingredientName: "Cereal", unit: "400 grams" },
  { vectorId: 1353834698, productName: "Wheat flour, 2.5 kilograms", ingredientName: "Wheat flour", unit: "2.5 kilograms" },
  { vectorId: 1353834699, productName: "White sugar, 2 kilograms", ingredientName: "White sugar", unit: "2 kilograms" },
  { vectorId: 1353834700, productName: "Apple juice, 2 litres", ingredientName: "Apple juice", unit: "2 litres" },
  { vectorId: 1353834701, productName: "Orange juice, 2 litres", ingredientName: "Orange juice", unit: "2 litres" },
  { vectorId: 1353834702, productName: "Roasted or ground coffee, 340 grams", ingredientName: "Roasted or ground coffee", unit: "340 grams" },
  { vectorId: 1353834703, productName: "Tea (20 bags)", ingredientName: "Tea (20 bags)", unit: "Tea (20 bags)" },
  { vectorId: 1353834704, productName: "Ketchup, 1 litre", ingredientName: "Ketchup", unit: "1 litre" },
  { vectorId: 1353834705, productName: "Vegetable oil, 3 litres", ingredientName: "Vegetable oil", unit: "3 litres" },
  { vectorId: 1458870240, productName: "Canola oil, 3 litres", ingredientName: "Canola oil", unit: "3 litres" },
  { vectorId: 1458870254, productName: "Olive oil, 1 litre", ingredientName: "Olive oil", unit: "1 litre" },
  { vectorId: 1353834707, productName: "Peanut butter, 1 kilogram", ingredientName: "Peanut butter", unit: "1 kilogram" },
  { vectorId: 1353834708, productName: "Mayonnaise, 890 millilitres", ingredientName: "Mayonnaise", unit: "890 millilitres" },
  { vectorId: 1353834709, productName: "Canned baked beans, 398 millilitres", ingredientName: "Canned baked beans", unit: "398 millilitres" },
  { vectorId: 1353834710, productName: "Canned tomatoes, 796 millilitres", ingredientName: "Canned tomatoes", unit: "796 millilitres" },
  { vectorId: 1353834711, productName: "Canned soup, 284 millilitres", ingredientName: "Canned soup", unit: "284 millilitres" },
  { vectorId: 1353834712, productName: "Canned beans and lentils, 540 millilitres", ingredientName: "Canned beans and lentils", unit: "540 millilitres" },
  { vectorId: 1458870237, productName: "Canned corn, 341 millilitres", ingredientName: "Canned corn", unit: "341 millilitres" },
  { vectorId: 1458870238, productName: "Canned peach, 398 millilitres", ingredientName: "Canned peach", unit: "398 millilitres" },
  { vectorId: 1458870239, productName: "Canned pear, 398 millilitres", ingredientName: "Canned pear", unit: "398 millilitres" },
  { vectorId: 1353834713, productName: "Dried lentils, 900 grams", ingredientName: "Dried lentils", unit: "900 grams" },
  { vectorId: 1458870243, productName: "Dry beans and legumes, 900 grams", ingredientName: "Dry beans and legumes", unit: "900 grams" },
  { vectorId: 1458870266, productName: "Tofu, 350 grams", ingredientName: "Tofu", unit: "350 grams" },
  { vectorId: 1458870248, productName: "Hummus, 227 grams", ingredientName: "Hummus", unit: "227 grams" },
  { vectorId: 1458870260, productName: "Salsa, 418 millilitres", ingredientName: "Salsa", unit: "418 millilitres" },
  { vectorId: 1458870255, productName: "Pasta sauce, 650 millilitres", ingredientName: "Pasta sauce", unit: "650 millilitres" },
  { vectorId: 1458870257, productName: "Salad dressing, 475 millilitres", ingredientName: "Salad dressing", unit: "475 millilitres" },
  { vectorId: 1458870235, productName: "Almonds, 200 grams", ingredientName: "Almonds", unit: "200 grams" },
  { vectorId: 1458870256, productName: "Peanuts, 450 grams", ingredientName: "Peanuts", unit: "450 grams" },
  { vectorId: 1458870265, productName: "Sunflower seeds, 400 grams", ingredientName: "Sunflower seeds", unit: "400 grams" },
];

interface VectorApiResult {
  status: string;
  object?: {
    vectorId: number;
    vectorDataPoint: { refPer: string; value: number }[];
  };
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const toSync = VECTORS.filter((v) => !EXCLUDED_INGREDIENTS.has(v.ingredientName));

  const body = JSON.stringify(
    toSync.map((v) => ({ vectorId: v.vectorId, latestN: 1 }))
  );
  const statcanResp = await fetch(
    "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods",
    { method: "POST", headers: { "Content-Type": "application/json" }, body }
  );
  if (!statcanResp.ok) {
    return new Response(`StatCan API error: ${statcanResp.status}`, { status: 502 });
  }
  const results: VectorApiResult[] = await statcanResp.json();

  const rows = results
    .map((result, i) => {
      if (result.status !== "SUCCESS" || !result.object?.vectorDataPoint?.length) return null;
      const point = result.object.vectorDataPoint[0];
      const meta = toSync[i];
      return {
        product_name: meta.productName,
        ingredient_name: meta.ingredientName,
        unit: meta.unit,
        avg_price: point.value,
        geography: "British Columbia",
        reference_month: point.refPer,
        source: "statcan",
      };
    })
    .filter((r) => r !== null);

  const upsertResp = await fetch(
    `${supabaseUrl}/rest/v1/statcan_reference_prices?on_conflict=product_name,geography`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    }
  );

  if (!upsertResp.ok) {
    const text = await upsertResp.text();
    return new Response(`Supabase upsert error: ${upsertResp.status} ${text}`, { status: 502 });
  }

  return new Response(
    JSON.stringify({ synced: rows.length, skipped: toSync.length - rows.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});
