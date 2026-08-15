import Svg, { Path } from 'react-native-svg';

// Google Material Symbols (Outlined) -- "restaurant" and "avocado_bean",
// fetched as raw path data since @expo/vector-icons only bundles the
// older Material Icons/Material Community Icons sets, neither of which
// has an avocado_bean glyph. Same 24x24 (0 -960 960 960) grid both use.
interface MaterialSymbolProps {
  size?: number;
  color?: string;
}

export function RestaurantIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="M280-80v-366q-51-14-85.5-56T160-600v-280h80v280h40v-280h80v280h40v-280h80v280q0 56-34.5 98T360-446v366h-80Zm400 0v-320H560v-280q0-83 58.5-141.5T760-880v800h-80Z" />
    </Svg>
  );
}

export function AvocadoBeanIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="M380-220q66 0 113-46.5T540-380q0-66-47-113t-113-47q-67 0-113.5 47T220-380q0 67 46.5 113.5T380-220Zm0-80q-33 0-56.5-23.5T300-380q0-33 23.5-56.5T380-460q33 0 56.5 23.5T460-380q0 33-23.5 56.5T380-300Zm260 180q88 0 144-56t56-144q0-17-11.5-28.5T800-360q-17 0-28.5 11.5T760-320q0 48-36.5 84T640-200q-17 0-28.5 11.5T600-160q0 17 11.5 28.5T640-120Zm0 80q-51 0-85.5-34.5T520-160q0-50 34.5-85t85.5-35q14 0 27-13t13-27q0-50 34.5-85t85.5-35q50 0 85 35t35 85q0 121-79.5 200.5T640-40ZM380-80q-161 0-230.5-100T80-400q0-75 22.5-159.5t63-155.5Q206-786 261-833t119-47q56 0 105 36t87.5 93.5Q611-693 637-621.5T673-480h-81q-10-60-32-117.5T508.5-700q-29.5-45-63-72.5T380-800q-38 0-77 37t-71 94.5Q200-611 180-540t-20 140q0 81 25 129t60 72.5q35 24.5 72.5 31.5t62.5 7q12 0 27.5-1t32.5-5q-1 20 2 40t11 39q-17 4-35 5.5T380-80Zm0-300Zm320 120Z" />
    </Svg>
  );
}

// "arrow_outward" -- used as a trailing icon on external links (e.g. the
// recipe page's "See in flyer" link) to signal it opens outside the app.
export function ArrowOutwardIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="m256-240-56-56 384-384H240v-80h480v480h-80v-344L256-240Z" />
    </Svg>
  );
}

// "shoppingmode" -- leading icon on the recipe page's "On Sale This
// Week" heading (deal items card).
export function ShoppingModeIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="M446.75-80q-11.25 0-22.5-4.25T404-97L98-404q-9-8-13.5-19.5T80-446.25q0-11.25 4.3-22.5Q88.61-480 98-489l373-373q8.3-8.25 19.61-13.13Q501.93-880 514-880h307q24.75 0 42.38 17.62Q881-844.75 881-820v306q0 12.09-5 23.04Q871-480 863-472L489-97q-9 8-20 12.5T446.75-80ZM445-138l376-378v-304H514L139-445l306 307Zm271-526q21 0 36.5-15.5T768-716q0-21-15.5-36.5T716-768q-21 0-36.5 15.5T664-716q0 21 15.5 36.5T716-664ZM480-479Z" />
    </Svg>
  );
}

// "chef_hat" -- leading icon on the recipe page's "From your pantry"
// heading (staple items card).
export function ChefHatIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="M370-409h60v-183h-60v183Zm-160-50q-49-24-79.5-69T100-627q0-72.49 50.5-122.74Q201-800 273.41-800q11.59 0 23.08 1.71 11.48 1.72 22.51 4.29l8 2 4-7q23-40 63-60.5t86-20.5q46 0 86 20.5t63 60.5l4 7 8-2q11-3 22.46-4.5 11.47-1.5 23.89-1.5 71.65 0 122.15 50.26Q860-699.49 860-627q0 54-30.5 99T750-459v215H210v-215Zm320 50h60v-183h-60v183ZM270-305h420v-191l40-20q32-16 52-45.5t20-64.5q0-48-36-80t-85-32q-9 0-18 1.5t-18 3.5l-39 11-28-46q-16-26-41.98-39-25.98-13-56-13T424-807q-26 13-42 39l-28 46-40-11q-9-2-17.84-3.5-8.85-1.5-18.16-1.5-49 0-84.5 32.5T158-625q0 35 20 65t52 45l40 19v191Zm-60 61h60v104h420v-104h60v164H210v-164Zm270-61Z" />
    </Svg>
  );
}

// "list_alt" -- bottom nav tab icon for "My list" (app/(tabs)/_layout.tsx).
export function ListAltIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="M320-280q17 0 28.5-11.5T360-320q0-17-11.5-28.5T320-360q-17 0-28.5 11.5T280-320q0 17 11.5 28.5T320-280Zm0-160q17 0 28.5-11.5T360-480q0-17-11.5-28.5T320-520q-17 0-28.5 11.5T280-480q0 17 11.5 28.5T320-440Zm0-160q17 0 28.5-11.5T360-640q0-17-11.5-28.5T320-680q-17 0-28.5 11.5T280-640q0 17 11.5 28.5T320-600Zm120 320h240v-80H440v80Zm0-160h240v-80H440v80Zm0-160h240v-80H440v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
    </Svg>
  );
}

// "sell" -- bottom nav tab icon for "Weekly Deals" (app/(tabs)/_layout.tsx).
export function SellIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm220 160Z" />
    </Svg>
  );
}

// "person" -- bottom nav tab icon for "Profile" (app/(tabs)/_layout.tsx).
export function PersonIcon({ size = 16, color = '#888' }: MaterialSymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
      <Path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z" />
    </Svg>
  );
}
