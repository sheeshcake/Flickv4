import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import type { PartyChatLine } from '@/src/party/protocol';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PlayerChatToastProps {
  line: PartyChatLine | null;
  onOpen: () => void;
}

export const PlayerChatToast = ({ line, onOpen }: PlayerChatToastProps) => {
  if (!line) return null;

  return (
    <Box className="absolute bottom-16 right-4 z-20 max-w-xs">
      <Focusable
        onPress={onOpen}
        className="rounded-lg border border-border bg-card/95 px-3 py-2"
        focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
      >
        <Text size="xs" bold className="text-primary">
          {line.from}
        </Text>
        <Text size="sm" className="text-foreground" numberOfLines={2}>
          {line.text}
        </Text>
      </Focusable>
    </Box>
  );
};
