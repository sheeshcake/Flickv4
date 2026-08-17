import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import { PARTY_REACTIONS } from '@/src/components/party/partyReactions';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PlayerReactionPickerProps {
  onSelect: (emoji: string) => void;
}

const EmojiCell = ({
  emoji,
  onSelect,
}: {
  emoji: string;
  onSelect: (emoji: string) => void;
}) => (
  <Focusable
    onPress={() => onSelect(emoji)}
    className="h-9 w-9 items-center justify-center rounded-full"
    focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
  >
    <Text className="text-lg">{emoji}</Text>
  </Focusable>
);

export const PlayerReactionPicker = ({ onSelect }: PlayerReactionPickerProps) => (
  <Box className="self-center rounded-full border border-border bg-card/95 px-2 py-1">
    <HStack space="xs" className="items-center">
      {PARTY_REACTIONS.map((emoji) => (
        <EmojiCell key={emoji} emoji={emoji} onSelect={onSelect} />
      ))}
    </HStack>
  </Box>
);
