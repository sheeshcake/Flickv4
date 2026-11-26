import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Gauge, RefreshCw, Wifi } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { ScrollView } from '@/components/ui/scroll-view';
import { Switch } from 'react-native';
import { Focusable } from '@/src/components/Focusable';
import { EmptyState } from '@/src/components/EmptyState';
import {
  DNS_PRESETS,
  probeLatency,
  useDnsSettings,
  type DnsPreset,
} from '@/src/hooks/useDnsSettings';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface ProbeResult {
  id: DnsPreset;
  ms: number | null;
}

export const DnsSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { preset, setPreset, fallbackEnabled, setFallbackEnabled } =
    useDnsSettings();

  const [probing, setProbing] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);

  const runProbe = useCallback(async () => {
    setProbing(true);
    setResults([]);
    const out: ProbeResult[] = [];
    for (const p of DNS_PRESETS) {
      const ms = await probeLatency(p.probeUrl);
      out.push({ id: p.id, ms });
      setResults([...out]);
    }
    setProbing(false);
  }, []);

  useEffect(() => {
    runProbe();
  }, [runProbe]);

  const fastest = results
    .filter((r) => r.ms != null)
    .sort((a, b) => (a.ms ?? 9999) - (b.ms ?? 9999))[0];

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
          Speed server / DNS
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="xl" className="pb-10">
          <Text className="text-muted-foreground">
            Pick the DNS resolver used for stream resolution. A faster DNS
            reduces startup time for Live TV and streams. "System default"
            keeps your OS/network resolver.
          </Text>

          <VStack space="sm">
            {DNS_PRESETS.map((p) => {
              const active = preset === p.id;
              const r = results.find((x) => x.id === p.id);
              return (
                <Focusable
                  key={p.id}
                  onPress={() => setPreset(p.id)}
                  className={`rounded-md px-4 py-4 ${active ? 'bg-primary/20' : 'bg-card'}`}
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <HStack className="items-center justify-between">
                    <VStack className="flex-1">
                      <Text className={active ? 'font-semibold text-foreground' : 'text-foreground'}>
                        {p.label}
                      </Text>
                      <Text size="xs" className="text-muted-foreground">
                        {p.description}
                      </Text>
                    </VStack>
                    <VStack className="items-end">
                      {r ? (
                        <Text size="xs" className={r.ms == null ? 'text-muted-foreground' : 'text-foreground'}>
                          {r.ms == null ? 'unreachable' : `${r.ms} ms`}
                        </Text>
                      ) : (
                        <Text size="xs" className="text-muted-foreground">—</Text>
                      )}
                      {fastest?.id === p.id && r?.ms != null ? (
                        <Text size="2xs" className="text-primary">
                          fastest
                        </Text>
                      ) : null}
                    </VStack>
                  </HStack>
                </Focusable>
              );
            })}
          </VStack>

          <Button
            variant="outline"
            onPress={runProbe}
            isDisabled={probing}
          >
            <Icon as={RefreshCw} className="text-foreground" />
            <ButtonText>{probing ? 'Testing…' : 'Re-test speed'}</ButtonText>
          </Button>

          <HStack className="items-center justify-between rounded-lg bg-card px-4 py-4">
            <VStack className="flex-1">
              <Text className="text-foreground">Auto-fallback</Text>
              <Text size="xs" className="text-muted-foreground">
                If a stream fails to load, automatically try the next server.
              </Text>
            </VStack>
            <Switch
              value={fallbackEnabled}
              onValueChange={setFallbackEnabled}
              trackColor={{ true: '#C47C48', false: '#2E2E2E' }}
              thumbColor="#FFFFFF"
            />
          </HStack>

          {results.length > 0 && results.every((r) => r.ms == null) ? (
            <EmptyState
              icon={Wifi}
              title="No resolver reachable"
              description="Check your internet connection and re-test."
              actionLabel="Re-test"
              onAction={runProbe}
            />
          ) : null}
        </VStack>
      </ScrollView>
    </Box>
  );
};