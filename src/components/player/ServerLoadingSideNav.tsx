import { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Icon } from '@/components/ui/icon';
import { ScrollView } from '@/components/ui/scroll-view';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Focusable } from '@/src/components/Focusable';
import type { PlaybackServer } from '@/src/hooks/useServers';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

export interface StreamflixLoadingSource {
  id: string;
  name: string;
}

interface ServerLoadingSideNavProps {
  servers: PlaybackServer[];
  activeServerId: string;
  /** Servers already tried (and failed) this failover cycle — see
   * `PlayerScreen`'s `tryNextServer`. */
  triedServerIds: Set<string>;
  onSelectServer: (id: string) => void;
  streamflixSources?: StreamflixLoadingSource[];
  tryingStreamflixSourceId?: string | null;
  triedStreamflixIds?: Set<string>;
  onSelectStreamflixSource?: (id: string) => void;
  /** Debug-mode only: Hide collapses this list; a Show chip brings it back. */
  canHide?: boolean;
}

/**
 * Always-visible (no scrim, no open/close state) right-docked server list
 * shown while `PlayerScreen` is resolving a stream — `PlayerCore` (and so
 * `PlayerSettingsDrawer`'s own server picker) isn't mounted yet at this
 * point, so this is the only way to switch servers before either a stream
 * resolves or every server has been auto-failed-over through. Deliberately
 * narrower than the settings drawer and without its backdrop, so it doesn't
 * cover the centered "Finding stream…" spinner/text.
 */
export const ServerLoadingSideNav = ({
  servers,
  activeServerId,
  triedServerIds,
  onSelectServer,
  streamflixSources = [],
  tryingStreamflixSourceId,
  triedStreamflixIds,
  onSelectStreamflixSource,
  canHide = false,
}: ServerLoadingSideNavProps) => {
  const [hidden, setHidden] = useState(false);
  const showSources = streamflixSources.length > 0 && !!onSelectStreamflixSource;
  if (servers.length <= 1 && !showSources && !canHide) return null;

  if (canHide && hidden) {
    return (
      <Box className="absolute right-3 top-20 z-20">
        <Focusable
          onPress={() => setHidden(false)}
          className="rounded-full border border-border bg-card/95 px-3 py-2"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <HStack space="xs" className="items-center">
            <Icon as={Eye} size="sm" className="text-foreground" />
            <Text size="xs" className="text-foreground">
              Show
            </Text>
          </HStack>
        </Focusable>
      </Box>
    );
  }

  return (
    <Box className="absolute bottom-0 right-0 top-0 z-20 w-64 border-l border-border bg-card/95">
      <HStack className="items-center justify-between px-4 pt-4">
        <Text
          size="2xs"
          bold
          className="uppercase tracking-wide text-muted-foreground"
        >
          Servers
        </Text>
        {canHide ? (
          <Focusable
            onPress={() => setHidden(true)}
            className="rounded-md px-2 py-1"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <HStack space="xs" className="items-center">
              <Icon as={EyeOff} size="xs" className="text-foreground" />
              <Text size="2xs" className="text-foreground">
                Hide
              </Text>
            </HStack>
          </Focusable>
        ) : null}
      </HStack>
      <ScrollView>
        <VStack space="xs" className="p-2">
          {servers.map((s) => {
            const active = s.id === activeServerId;
            const failed = !active && triedServerIds.has(s.id);
            return (
              <Focusable
                key={s.id}
                onPress={() => !active && onSelectServer(s.id)}
                hasTVPreferredFocus={active}
                className={`rounded-md px-3 py-3 ${active ? 'bg-primary/20' : ''}`}
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <HStack className="items-center justify-between">
                  <Text
                    numberOfLines={1}
                    className={
                      active
                        ? 'flex-1 font-semibold text-foreground'
                        : 'flex-1 text-muted-foreground'
                    }
                  >
                    {s.name}
                  </Text>
                  {active ? (
                    <Spinner size="small" color="#E50914" />
                  ) : failed ? (
                    <HStack space="xs" className="items-center">
                      <Icon as={X} size="xs" className="text-muted-foreground" />
                      <Text size="2xs" className="text-muted-foreground">
                        Failed
                      </Text>
                    </HStack>
                  ) : null}
                </HStack>
              </Focusable>
            );
          })}
        </VStack>
        {showSources ? (
          <VStack space="xs" className="p-2 pt-0">
            <Text
              size="2xs"
              bold
              className="px-2 pt-2 uppercase tracking-wide text-muted-foreground"
            >
              Sources
            </Text>
            {streamflixSources.map((s) => {
              const active = s.id === tryingStreamflixSourceId;
              const failed = !active && Boolean(triedStreamflixIds?.has(s.id));
              return (
                <Focusable
                  key={s.id}
                  onPress={() => !active && onSelectStreamflixSource?.(s.id)}
                  className={`rounded-md px-3 py-3 ${active ? 'bg-primary/20' : ''}`}
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <HStack className="items-center justify-between">
                    <Text
                      numberOfLines={1}
                      className={
                        active
                          ? 'flex-1 font-semibold text-foreground'
                          : 'flex-1 text-muted-foreground'
                      }
                    >
                      {s.name}
                    </Text>
                    {active ? (
                      <Spinner size="small" color="#E50914" />
                    ) : failed ? (
                      <HStack space="xs" className="items-center">
                        <Icon as={X} size="xs" className="text-muted-foreground" />
                        <Text size="2xs" className="text-muted-foreground">
                          Failed
                        </Text>
                      </HStack>
                    ) : null}
                  </HStack>
                </Focusable>
              );
            })}
          </VStack>
        ) : null}
      </ScrollView>
    </Box>
  );
};
