import Svg, { Path } from 'react-native-svg';

// Vector traced from assets/google-svgrepo-com.svg -- kept as a real
// brand mark (not swapped for a Heroicon) since it's an OS/brand
// identifier, not generic UI iconography.
export function GoogleIcon({ size = 20, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill={color}>
      <Path d="M24.7,20.5v7.6H35.6a10.9,10.9,0,0,1-10.9,8,12.1,12.1,0,1,1,7.9-21.3l5.6-5.6A20,20,0,1,0,24.7,44c16.8,0,20.5-15.7,18.9-23.5Z" />
    </Svg>
  );
}
