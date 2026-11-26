import { memo, useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, BellOff, Check } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Image } from '@/components/ui/image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import {
  isReleaseReminderEnabled,
  reminderKeyFor,
  subscribeReleaseReminders,
  toggleReleaseReminder,
} from '@/src/services/ReleaseReminderService';
import { TMDBService } from '@/src/services/TMDBService';
import { formatComingLabel } from '@/src/utils/comingSoon';
import { getReleaseDate, getTitle, type MediaItem } from '@/src/types';
import { getGenreName } from '@/src/utils/genres';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface UpcomingCardProps {
  item: MediaItem;
  /** Width of the content area (window width minus horizontal padding). */
  width: number;
  onPress: (item: MediaItem) => void;
  /** Set false when the card is used somewhere without reminder support. */
  showReminder?: boolean;
}

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

const dateParts = (iso?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!match) return { month: 'SOON', day: '', year: '' };
  const [, year, month, day] = match;
  return {
    month: MONTHS[Number(month) - 1] ?? 'SOON',
    day: String(Number(day)),
    year,
  };
};

const genreTags = (ids: number[] | undefined): string =>
  (ids ?? [])
    .slice(0, 3)
    .map(getGenreName)
    .filter(Boolean)
    .join('  •  ');

const reminderMessage = (reason?: string): string => {
  switch (reason) {
    case 'permission':
      return 'Allow notifications in Settings, then tap Remind me again.';
    case 'past-date':
      return 'This title is already out, so there is no future date to remind you about.';
    case 'unsupported':
      return 'Local release reminders are available in the mobile app.';
    case 'no-date':
      return 'No release date has been announced for this title yet.';
    default:
      return 'The reminder could not be set. Please try again.';
  }
};

const UpcomingCardBase = ({
  item,
  width,
  onPress,
  showReminder = true,
}: UpcomingCardProps) => {
  const iso = getReleaseDate(item);
  const date = dateParts(iso);
  const key = reminderKeyFor(item);
  const imagePath = item.backdrop_path ?? item.poster_path;
  const imageUrl = TMDBService.getImageUrl(imagePath, 'w780');
  const tags = genreTags(item.genre_ids);
  const badgeWidth = width > 900 ? 66 : 54;
  const artWidth = Math.max(140, width - badgeWidth - 32);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void isReleaseReminderEnabled(item).then((value) => {
      if (alive) setEnabled(value);
    });
    const unsubscribe = subscribeReleaseReminders((reminders) => {
      if (alive) setEnabled(reminders.some((reminder) => reminder.key === key));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
    // The reminder key is derived from media type + TMDB id; no need to
    // re-subscribe when a parent re-renders with a fresh item object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await toggleReleaseReminder(item);
      if (!result.enabled && result.reason) {
        Alert.alert('Reminder not set', reminderMessage(result.reason));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, item]);

  return (
    <Box
      className="mb-3 overflow-hidden rounded-2xl border border-border/70 bg-card/85"
      style={{
        width,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <HStack className="items-stretch">
        <LinearGradient
          colors={['#C47C48', '#6B3D22']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: badgeWidth,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 10,
          }}
        >
          <Text size="xs" bold className="text-primary-foreground">
            {date.month}
          </Text>
          <Text size="xl" bold className="text-primary-foreground">
            {date.day}
          </Text>
          {date.year ? (
            <Text size="2xs" className="text-primary-foreground/80">
              {date.year}
            </Text>
          ) : null}
        </LinearGradient>

        <Focusable
          onPress={() => onPress(item)}
          className="flex-1 px-3 py-3"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <VStack space="xs" style={{ width: artWidth }}>
            <Box
              className="overflow-hidden rounded-xl bg-secondary"
              style={{ width: artWidth, height: artWidth * 0.5 }}
            >
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  alt={getTitle(item)}
                  resizeMode="cover"
                  className="h-full w-full"
                />
              ) : null}
            </Box>
            <Heading size="sm" bold className="text-foreground" numberOfLines={1}>
              {getTitle(item)}
            </Heading>
            <Text size="xs" bold className="text-primary">
              {formatComingLabel(iso)}
            </Text>
            {tags ? (
              <Text size="2xs" className="text-muted-foreground" numberOfLines={1}>
                {tags}
              </Text>
            ) : null}
          </VStack>
        </Focusable>
      </HStack>

      {showReminder ? (
        <Focusable
          onPress={() => void toggle()}
          className="border-t border-border/60 bg-secondary/45 px-3 py-2"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <HStack className="items-center justify-between">
            <HStack space="xs" className="items-center">
              <Icon
                as={enabled ? Check : Bell}
                size="xs"
                className={enabled ? 'text-primary' : 'text-muted-foreground'}
              />
              <Text
                size="xs"
                bold={enabled}
                className={enabled ? 'text-primary' : 'text-foreground'}
              >
                {enabled ? 'Reminder set' : 'Remind me on release day'}
              </Text>
            </HStack>
            <Icon
              as={enabled ? BellOff : Bell}
              size="xs"
              className="text-muted-foreground"
            />
          </HStack>
        </Focusable>
      ) : null}
    </Box>
  );
};

export const UpcomingCard = memo(UpcomingCardBase);
