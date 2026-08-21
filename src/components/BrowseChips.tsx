import { Globe } from 'lucide-react-native';
import { ScrollView } from '@/components/ui/scroll-view';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import { buildBrowseChips } from '@/src/config/homeFeed';
import { getRegionName, useCatalogRegion } from '@/src/hooks/useCatalogRegion';
import type { CategoryQuery } from '@/src/services/categories';
import type { DeviceKind } from '@/src/utils/responsive';
import { getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface BrowseChipsProps {
  deviceKind: DeviceKind;
  onSelect: (title: string, query: CategoryQuery) => void;
  onRegionPress: () => void;
}

export const BrowseChips = ({
  deviceKind,
  onSelect,
  onRegionPress,
}: BrowseChipsProps) => {
  const padding = getHorizontalPadding(deviceKind);
  const { region } = useCatalogRegion();
  const chips = buildBrowseChips(region);

  return (
    <Box className="mb-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: padding,
          gap: 8,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Focusable
          onPress={onRegionPress}
          className="rounded-full border border-primary/40 bg-primary/20 px-4 py-2"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <HStack space="xs" className="items-center">
            <Icon as={Globe} size="sm" className="text-primary" />
            <Text size="sm" className="font-semibold text-foreground">
              {getRegionName(region)}
            </Text>
          </HStack>
        </Focusable>
        {chips.map((chip) => (
          <Focusable
            key={chip.label}
            onPress={() => onSelect(chip.label, chip.query)}
            className="rounded-full border border-border bg-card px-4 py-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Text size="sm" className="text-foreground">
              {chip.label}
            </Text>
          </Focusable>
        ))}
      </ScrollView>
    </Box>
  );
};
