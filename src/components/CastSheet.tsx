import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Focusable } from '@/src/components/Focusable';
import { TMDBService } from '@/src/services/TMDBService';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { CastMember, CrewMember } from '@/src/types';

export interface CastPersonTarget {
  personId: number;
  name: string;
  profilePath?: string | null;
}

interface CastSheetProps {
  visible: boolean;
  cast: CastMember[];
  crew?: CrewMember[];
  onClose: () => void;
  onPressPerson: (person: CastPersonTarget) => void;
}

interface CastRow {
  id: number;
  name: string;
  profilePath: string | null;
  role?: string;
}

export const CastSheet = ({
  visible,
  cast,
  crew = [],
  onClose,
  onPressPerson,
}: CastSheetProps) => {
  // Cast roles win over crew jobs for duplicate people, but every person is
  // listed once so tapping a photo always leads to that artist's works.
  const rows = useMemo<CastRow[]>(() => {
    const byId = new Map<number, CastRow>();
    cast.forEach((member) => {
      byId.set(member.id, {
        id: member.id,
        name: member.name,
        profilePath: member.profile_path ?? null,
        role: member.character,
      });
    });
    crew.forEach((member) => {
      const role = member.job || member.department;
      const existing = byId.get(member.id);
      if (!existing) {
        byId.set(member.id, {
          id: member.id,
          name: member.name,
          profilePath: member.profile_path ?? null,
          role,
        });
        return;
      }
      byId.set(member.id, {
        ...existing,
        profilePath: existing.profilePath ?? member.profile_path ?? null,
        role:
          role && existing.role && role !== existing.role
            ? `${existing.role} · ${role}`
            : existing.role ?? role,
      });
    });
    return [...byId.values()];
  }, [cast, crew]);

  if (!visible) return null;

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-2xl bg-card px-4 pb-8 pt-4">
        <Heading size="md" className="mb-1 text-foreground">
          Cast & Crew
        </Heading>
        <Text size="xs" className="mb-3 text-muted-foreground">
          Tap anyone to see all of their work.
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          <VStack space="xs">
            {rows.map((member) => {
              const photoUrl = TMDBService.getImageUrl(
                member.profilePath,
                'w200',
              );
              return (
                <Focusable
                  key={member.id}
                  onPress={() =>
                    onPressPerson({
                      personId: member.id,
                      name: member.name,
                      profilePath: member.profilePath,
                    })
                  }
                  className="rounded-md"
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <HStack space="md" className="items-center py-1.5">
                    {photoUrl ? (
                      <Image
                        source={{ uri: photoUrl }}
                        alt={member.name}
                        resizeMode="cover"
                        className="h-12 w-12 rounded-full"
                      />
                    ) : (
                      <Center className="h-12 w-12 rounded-full bg-muted">
                        <Icon
                          as={User}
                          size="sm"
                          className="text-muted-foreground"
                        />
                      </Center>
                    )}
                    <VStack className="flex-1">
                      <Text
                        size="sm"
                        className="font-semibold text-foreground"
                        numberOfLines={1}
                      >
                        {member.name}
                      </Text>
                      {!!member.role && (
                        <Text
                          size="xs"
                          className="text-muted-foreground"
                          numberOfLines={1}
                        >
                          {member.role}
                        </Text>
                      )}
                    </VStack>
                  </HStack>
                </Focusable>
              );
            })}
          </VStack>
        </ScrollView>
      </Box>
    </Box>
  );
};
