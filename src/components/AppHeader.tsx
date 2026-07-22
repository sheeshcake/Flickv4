import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Box } from '@/components/ui/box';
import type { ReactNode } from 'react';

interface AppHeaderProps {
  right?: ReactNode;
  paddingHorizontal?: number;
}

export const AppHeader = ({ right, paddingHorizontal = 16 }: AppHeaderProps) => {
  return (
    <HStack
      className="items-center space-between py-3"
      style={{ paddingHorizontal }}
    >
      <Image
        source={require('@/assets/images/logo-full.png')}
        alt="Flick"
        resizeMode="contain"
        className="h-12 w-20"
      />
      <Box>{right}</Box>
    </HStack>
  );
};
