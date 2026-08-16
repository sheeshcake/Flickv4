import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Focusable } from '@/src/components/Focusable';
import { PARTY_REACTIONS } from '@/src/components/party/partyReactions';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PlayerReactionPickerProps {
  onSelect: (emoji: string) => void;
}

const ROW_A = PARTY_REACTIONS.slice(0, 4);
const ROW_B = PARTY_REACTIONS.slice(4);

const EmojiCell = ({
  emoji,
  onSelect,
}: {
  emoji: string;
  onSelect: (emoji: string) => void;
}) => (
  <Focusable
    onPress={() => onSelect(emoji)}
    className="h-11 w-11 items-center justify-center rounded-full"
    focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
  >
    <Text className="text-2xl">{emoji}</Text>
  </Focusable>
);

export const PlayerReactionPicker = ({ onSelect }: PlayerReactionPickerProps) => (
  <Box className="rounded-xl border border-border bg-card/95 px-2 py-2">
    <VStack space="xs">
      <HStack space="xs">
        {ROW_A.map((emoji) => (
          <EmojiCell key={emoji} emoji={emoji} onSelect={onSelect} />
        ))}
      </HStack>
      <HStack space="xs">
        {ROW_B.map((emoji) => (
          <EmojiCell key={emoji} emoji={emoji} onSelect={onSelect} />
        ))}
      </HStack>
    </VStack>
  </Box>
);
