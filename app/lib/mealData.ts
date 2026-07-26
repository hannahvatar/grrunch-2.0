// Sample meal + recipe data for the guest-mode flow's Main App screens.
// Static for now — real generation (Claude API + curated_deals) isn't wired
// up yet. MEALS is a pool to draw from: the Meals screen's initial plan is
// the first 4, and "Swap" picks a replacement from the rest of the pool.
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
  {
    id: 'beef-broccoli-rice-bowl',
    name: 'Beef & Broccoli Rice Bowl',
    price: 4.15,
    minutes: 25,
    tag: 'Beef strips · 38% off · Broccoli · 40% off',
    calories: 570,
    protein: 32,
    ingredients: [
      '1 lb beef strips',
      '3 cups broccoli florets',
      '3 tbsp soy sauce',
      '1 tbsp brown sugar',
      '2 cloves garlic, minced',
      '2 cups cooked rice',
    ],
    instructions: [
      'Sear beef strips in a hot pan until browned, about 4 minutes, then set aside.',
      'Steam or stir-fry broccoli until just tender, 3-4 minutes.',
      'Whisk soy sauce, brown sugar, and garlic in the pan and simmer 1 minute.',
      'Return beef to the pan, toss with broccoli and sauce, and serve over rice.',
    ],
  },
  {
    id: 'lentil-vegetable-curry',
    name: 'Lentil & Vegetable Curry',
    price: 2.68,
    minutes: 35,
    tag: 'Lentils · staple · Carrots · 30% off',
    calories: 460,
    protein: 22,
    ingredients: [
      '1.5 cups dried red lentils',
      '2 carrots, diced',
      '1 onion, diced',
      '2 tbsp curry powder',
      '1 can coconut milk',
      '2 cups vegetable broth',
    ],
    instructions: [
      'Sauté onion and carrots until softened, about 5 minutes.',
      'Stir in curry powder and cook 1 minute until fragrant.',
      'Add lentils, coconut milk, and broth, and bring to a simmer.',
      'Cook uncovered, stirring occasionally, until lentils are tender, about 20 minutes.',
    ],
  },
  {
    id: 'baked-tilapia-with-rice',
    name: 'Baked Tilapia with Rice',
    price: 3.62,
    minutes: 30,
    tag: 'Tilapia · 33% off',
    calories: 410,
    protein: 30,
    ingredients: [
      '4 tilapia fillets',
      '2 tbsp olive oil',
      '1 lemon, sliced',
      '1 tsp paprika',
      '2 cups cooked rice',
      'Salt and pepper, to taste',
    ],
    instructions: [
      'Preheat oven to 400°F (200°C).',
      'Arrange tilapia on a baking sheet, drizzle with olive oil, and season with paprika, salt, and pepper.',
      'Top with lemon slices and bake until fish flakes easily, about 15 minutes.',
      'Serve over rice with pan juices spooned over top.',
    ],
  },
  {
    id: 'turkey-chili',
    name: 'Turkey Chili',
    price: 3.29,
    minutes: 40,
    tag: 'Ground turkey · 37% off · Canned beans · staple',
    calories: 490,
    protein: 36,
    ingredients: [
      '1 lb ground turkey',
      '1 can kidney beans, drained',
      '1 can diced tomatoes',
      '1 onion, diced',
      '2 tbsp chili powder',
      '1 bell pepper, diced',
    ],
    instructions: [
      'Brown ground turkey with onion and bell pepper, about 6 minutes.',
      'Stir in chili powder and cook 1 minute until fragrant.',
      'Add beans and diced tomatoes, and bring to a simmer.',
      'Simmer uncovered, stirring occasionally, until thickened, about 25 minutes.',
    ],
  },
];
