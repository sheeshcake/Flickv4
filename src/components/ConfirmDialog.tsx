import { Modal, StyleSheet } from 'react-native';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small gluestack-based confirmation dialog. Kept intentionally minimal so
 * both the delete-download flow and the hold-to-delete UX on Home can share
 * the same look.
 */
export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Box className="flex-1 bg-background/80" style={StyleSheet.absoluteFill}>
        <Box className="flex-1 items-center justify-center px-6">
          <Box className="w-full max-w-sm rounded-2xl bg-card p-5">
            <VStack space="sm">
              <Heading size="md" bold className="text-foreground">
                {title}
              </Heading>
              {!!message && (
                <Text size="sm" className="text-muted-foreground">
                  {message}
                </Text>
              )}

              <HStack space="sm" className="mt-4 justify-end">
                <Focusable
                  onPress={onCancel}
                  className="rounded-md border border-border px-4 py-2"
                  focusedClassName="scale-[1.02] border-primary bg-primary/10"
                >
                  <Text className="text-foreground">{cancelLabel}</Text>
                </Focusable>
                <Focusable
                  onPress={onConfirm}
                  hasTVPreferredFocus
                  className={`rounded-md px-4 py-2 ${destructive ? 'bg-primary' : 'bg-foreground'}`}
                  focusedClassName="scale-[1.02] border border-foreground"
                >
                  <Text
                    className={
                      destructive
                        ? 'font-semibold text-primary-foreground'
                        : 'font-semibold text-background'
                    }
                  >
                    {confirmLabel}
                  </Text>
                </Focusable>
              </HStack>
            </VStack>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};
