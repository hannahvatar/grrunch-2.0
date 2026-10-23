import { Redirect } from 'expo-router';

// The Recipes tab was called Meals (and lived at /meals) until 2026-10-23
// (Anabelle: "Meals" sounds like prepared meals). Old links and bookmarks
// land here and go on to /recipes. Lives inside (tabs) as a hidden tab:
// redirecting from outside the tab group left the tabs showing their
// first tab (Home) under the /recipes address.
export default function MealsRedirect() {
  return <Redirect href="/recipes" />;
}
