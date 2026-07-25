// Sample meal + recipe data for the guest-mode flow's Main App screens.
// Static for now — real generation (Claude API + curated_deals) isn't wired
// up yet, this just backs the Meals list and its recipe detail view.
export interface Meal {
  id: string;
  name: string;
  price: number;
  minutes: number;
  tag: string;
  calories: number;
  protein: number;
  ingredients: string[];
  instructions: string[];
}

export const MEALS: Meal[] = [
  {
    id: 'honey-garlic-chicken-thighs',
    name: 'Honey Garlic Chicken Thighs',
    price: 4.89,
    minutes: 30,
    tag: 'Chicken thighs · 42% off',
    calories: 610,
    protein: 34,
    ingredients: [
      '4 chicken thighs, bone-in',
      '2 tbsp honey',
      '3 cloves garlic, minced',
      '2 tbsp soy sauce',
      '1 tbsp vegetable oil',
      'Steamed rice, to serve',
    ],
    instructions: [
      'Pat chicken thighs dry and season with salt and pepper.',
      'Sear skin-side down in oil over medium-high heat until golden, about 6 minutes.',
      'Flip, add garlic, honey, and soy sauce, and simmer until cooked through, about 12 minutes.',
      'Rest 5 minutes, then serve over rice with pan sauce spooned over top.',
    ],
  },
  {
    id: 'ground-pork-bok-choy-stir-fry',
    name: 'Ground Pork & Bok Choy Stir-Fry',
    price: 3.74,
    minutes: 20,
    tag: 'Ground pork · 35% off · Bok choy · 53% off',
    calories: 540,
    protein: 28,
    ingredients: [
      '1 lb ground pork',
      '4 heads baby bok choy, chopped',
      '2 tbsp soy sauce',
      '1 tbsp sesame oil',
      '2 cloves garlic, minced',
      '1 cup cooked rice or noodles',
    ],
    instructions: [
      'Brown ground pork in a hot pan, breaking it up as it cooks, about 6 minutes.',
      'Add garlic and cook 30 seconds until fragrant.',
      'Add bok choy and stir-fry until just wilted, 2-3 minutes.',
      'Stir in soy sauce and sesame oil, then serve over rice or noodles.',
    ],
  },
  {
    id: 'chicken-noodle-soup',
    name: 'Chicken Noodle Soup',
    price: 3.91,
    minutes: 45,
    tag: 'Chicken thighs · 42% off',
    calories: 420,
    protein: 26,
    ingredients: [
      '2 chicken thighs, boneless',
      '6 cups chicken broth',
      '2 carrots, sliced',
      '2 stalks celery, sliced',
      '2 cups egg noodles',
      '1 onion, diced',
    ],
    instructions: [
      'Simmer chicken thighs in broth with onion until cooked through, about 20 minutes.',
      'Remove chicken, shred, and set aside.',
      'Add carrots and celery to the broth and simmer until tender, 10 minutes.',
      'Add noodles and shredded chicken, and cook until noodles are tender, 8 minutes.',
    ],
  },
  {
    id: 'spinach-egg-scramble-on-toast',
    name: 'Spinach Egg Scramble on Toast',
    price: 2.47,
    minutes: 15,
    tag: 'Eggs · 46% off · Sourdough · 33% off',
    calories: 380,
    protein: 20,
    ingredients: [
      '4 eggs',
      '2 cups fresh spinach',
      '2 slices sourdough bread',
      '1 tbsp butter',
      'Salt and pepper, to taste',
    ],
    instructions: [
      'Toast the sourdough slices.',
      'Melt butter in a pan over medium heat and wilt the spinach, about 2 minutes.',
      'Whisk eggs, add to the pan, and scramble until just set.',
      'Season with salt and pepper and serve over the toast.',
    ],
  },
];
