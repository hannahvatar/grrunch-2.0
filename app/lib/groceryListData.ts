// Sample grocery list data matching the wireframe. Shared between the
// Meals-tab modal (app/grocery-list.tsx) and the Grocery tab's full page
// (app/(tabs)/grocery.tsx) so both render the exact same list.
export const STORE_SECTIONS = [
  {
    store: 'Save-On-Foods',
    items: [
      { name: 'Chicken thighs', qty: '2 kg', discountPct: 42 },
      { name: 'Organic whole milk', qty: '2 L', discountPct: 42 },
    ],
  },
  {
    store: 'Real Canadian Superstore',
    items: [
      { name: 'Free range eggs', qty: '12 ct', discountPct: 46 },
      { name: 'Butter, unsalted', qty: '454 g', discountPct: 44 },
      { name: 'Ground pork', qty: '1 kg', discountPct: 35 },
    ],
  },
  {
    store: 'Safeway',
    items: [{ name: 'Sourdough loaf', qty: '1 loaf', discountPct: 33 }],
  },
];
