import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  Baby,
  Clapperboard,
  Compass,
  Drama,
  Ghost,
  Heart,
  Landmark,
  Laugh,
  Music,
  Newspaper,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Tv,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import {
  CATEGORY_CATALOG,
  supportsScope,
  type BrowseScope,
  type CategoryDefinition,
} from '@/src/config/categoriesCatalog';
import type { DeviceKind } from '@/src/utils/responsive';
import { getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface GenreGridProps {
  deviceKind: DeviceKind;
  onSelect: (scope: BrowseScope, category?: CategoryDefinition) => void;
}

interface CategoryEntry {
  id: string;
  name: string;
  icon: LucideIcon;
  category?: CategoryDefinition;
}

const SCOPES: { key: BrowseScope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'series', label: 'Series' },
  { key: 'films', label: 'Films' },
];

const ICON_BY_NAME: Record<string, LucideIcon> = {
  action: Swords,
  'action & adventure': Swords,
  adventure: Compass,
  animation: Sparkles,
  comedy: Laugh,
  crime: Shield,
  documentaries: Landmark,
  documentary: Landmark,
  drama: Drama,
  family: Users,
  fantasy: Sparkles,
  history: Landmark,
  horror: Ghost,
  kids: Baby,
  music: Music,
  mystery: Skull,
  reality: Tv,
  romance: Heart,
  'sci-fi': Rocket,
  'science fiction': Rocket,
  'sci-fi & fantasy': Rocket,
  thrillers: Skull,
  thriller: Skull,
  war: Swords,
  westerns: Landmark,
  western: Landmark,
};

const iconFor = (name: string): LucideIcon =>
  ICON_BY_NAME[name.trim().toLowerCase()] ?? Clapperboard;

const scopeName = (scope: BrowseScope): string =>
  scope === 'series' ? 'All Series' : scope === 'films' ? 'All Films' : 'Everything';

export const GenreGrid = ({ deviceKind, onSelect }: GenreGridProps) => {
  const padding = getHorizontalPadding(deviceKind);
  const [scope, setScope] = useState<BrowseScope>('all');

  const entries = useMemo<CategoryEntry[]>(
    () => [
      { id: `all-${scope}`, name: scopeName(scope), icon: Sparkles, category: undefined },
      ...CATEGORY_CATALOG.filter((category) => supportsScope(category, scope)).map(
        (category) => ({
          id: category.id,
          name: category.name,
          icon: iconFor(category.name),
          category,
        }),
      ),
    ],
    [scope],
  );

  const columns = useMemo<CategoryEntry[][]>(() => {
    const cols: CategoryEntry[][] = [];
    for (let i = 0; i < entries.length; i += 2) {
      cols.push(entries.slice(i, i + 2));
    }
    return cols;
  }, [entries]);

  return (
    <Box className="mb-6">
      <HStack
        className="mb-3 items-center justify-between"
        style={{ paddingHorizontal: padding }}
      >
        <Heading size="md" className="text-foreground">
          Categories
        </Heading>
        <HStack space="sm">
          {SCOPES.map((option) => {
            const active = scope === option.key;
            return (
              <Focusable
                key={option.key}
                onPress={() => setScope(option.key)}
                className={`rounded-full px-3 py-1 ${
                  active
                    ? 'border border-primary/40 bg-primary/20'
                    : 'border border-border bg-card'
                }`}
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Text
                  size="sm"
                  className={
                    active
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  {option.label}
                </Text>
              </Focusable>
            );
          })}
        </HStack>
      </HStack>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: padding,
          gap: 8,
          flexDirection: 'row',
        }}
      >
        {columns.map((col, colIndex) => (
          <VStack key={`col-${colIndex}`} space="sm" className="w-44">
            {col.map((entry) => (
              <Focusable
                key={`${scope}-${entry.id}`}
                onPress={() => onSelect(scope, entry.category)}
                className="rounded-xl border border-border bg-card px-3 py-3"
                focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
              >
                <HStack space="sm" className="items-center">
                  <Box className="h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                    <Icon as={entry.icon} size="sm" className="text-primary" />
                  </Box>
                  <Text
                    size="sm"
                    className="flex-1 text-foreground"
                    numberOfLines={1}
                  >
                    {entry.name}
                  </Text>
                </HStack>
              </Focusable>
            ))}
          </VStack>
        ))}
      </ScrollView>
    </Box>
  );
};
