import { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Search as SearchIcon } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import {
  CATALOG_REGIONS,
  useCatalogRegion,
} from '@/src/hooks/useCatalogRegion';
import { useHomeData } from '@/src/hooks/useHomeData';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

export const RegionSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { region, setRegion } = useCatalogRegion();
  const { refresh } = useHomeData();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return CATALOG_REGIONS;
    return CATALOG_REGIONS.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term),
    );
  }, [query]);

  const select = (code: string) => {
    if (code === region) {
      navigation.goBack();
      return;
    }
    setRegion(code);
    refresh();
    navigation.goBack();
  };

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Focusable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          className="rounded-full"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Focusable>
        <Heading size="xl" bold className="text-foreground">
          Catalog region
        </Heading>
      </HStack>

      <VStack space="md" className="flex-1 px-4">
        <Text className="text-muted-foreground">
          Top 10 in your country, streaming shelves, and genres follow this
          region. Worldwide Top 10 rows stay global.
        </Text>

        <Input className="h-12 rounded-full bg-card">
          <InputSlot className="pl-3">
            <InputIcon as={SearchIcon} />
          </InputSlot>
          <InputField
            placeholder="Search countries"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            className="text-foreground"
          />
        </Input>

        <ScrollView className="flex-1">
          <VStack space="sm" className="pb-10">
            {filtered.map((item) => {
              const active = region === item.code;
              return (
                <Focusable
                  key={item.code}
                  onPress={() => select(item.code)}
                  className={`rounded-md px-4 py-4 ${active ? 'bg-primary/20' : 'bg-card'}`}
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <HStack className="items-center justify-between">
                    <VStack>
                      <Text
                        className={
                          active
                            ? 'font-semibold text-foreground'
                            : 'text-foreground'
                        }
                      >
                        {item.name}
                      </Text>
                      <Text size="xs" className="text-muted-foreground">
                        {item.code}
                      </Text>
                    </VStack>
                    {active ? (
                      <Icon as={Check} className="text-primary" />
                    ) : null}
                  </HStack>
                </Focusable>
              );
            })}
            {filtered.length === 0 ? (
              <Text className="py-8 text-center text-muted-foreground">
                No countries match that search.
              </Text>
            ) : null}
          </VStack>
        </ScrollView>
      </VStack>
    </Box>
  );
};
