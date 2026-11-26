import { Image } from '@/components/ui/image';
import Svg, { Text as SvgText } from 'react-native-svg';

interface FlickLogoProps {
  width: number;
  height: number;
}

export const FlickLogo = ({ width, height }: FlickLogoProps) =>
  width >= height * 2 ? (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 240 64"
      accessibilityLabel="CoFFe House"
    >
      <SvgText x="0" y="46" fill="#D32F2F" fontSize="40" fontWeight="700">
        CoFFe
      </SvgText>
      <SvgText x="118" y="46" fill="#FFFFFF" fontSize="40" fontWeight="700">
        House
      </SvgText>
    </Svg>
  ) : (
    <Image
      size="full"
      source={require('../../assets/applogo/ic_launcher.jpeg')}
      resizeMode="contain"
      accessibilityLabel="CoFFe House"
    />
  );
