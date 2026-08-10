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
