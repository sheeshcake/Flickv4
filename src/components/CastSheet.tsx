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
import { TMDBService } from '@/src/services/TMDBService';
import type { CastMember } from '@/src/types';

interface CastSheetProps {
  visible: boolean;
  cast: CastMember[];
  onClose: () => void;
}

export const CastSheet = ({ visible, cast, onClose }: CastSheetProps) => {
  if (!visible) return null;

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-2xl bg-card px-4 pb-8 pt-4">
        <Heading size="md" className="mb-3 text-foreground">
          Cast
        </Heading>
        <ScrollView showsVerticalScrollIndicator={false}>
          <VStack space="sm">
            {cast.map((member) => {
              const photoUrl = TMDBService.getImageUrl(
                member.profile_path,
                'w200',
              );
              return (
                <HStack key={member.id} space="md" className="items-center">
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
                    {!!member.character && (
                      <Text
                        size="xs"
                        className="text-muted-foreground"
                        numberOfLines={1}
                      >
                        {member.character}
                      </Text>
                    )}
                  </VStack>
                </HStack>
              );
            })}
          </VStack>
        </ScrollView>
      </Box>
    </Box>
  );
};
