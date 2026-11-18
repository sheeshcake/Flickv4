import { WifiOff } from 'lucide-react-native';
import { EmptyState } from '@/src/components/EmptyState';
import { friendlyErrorMessage } from '@/src/utils/errorMessage';

interface ErrorStateProps {
  /** Raw error from the service; translated by `friendlyErrorMessage`. */
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  /** True while the retry request is in flight. */
  retrying?: boolean;
  compact?: boolean;
}

/**
 * Shared failure state: friendly copy, an offline icon, and a retry action.
 * Previously screens rendered raw `err.message` text with no way to recover
 * except leaving and re-entering the screen.
 */
export const ErrorState = ({
  error,
  title = "Couldn't load this",
  description,
  onRetry,
  retrying = false,
  compact = false,
}: ErrorStateProps) => (
  <EmptyState
    icon={WifiOff}
    title={title}
    description={description ?? friendlyErrorMessage(error)}
    actionLabel={onRetry ? (retrying ? 'Retrying…' : 'Try again') : undefined}
    onAction={onRetry}
    actionDisabled={retrying}
    compact={compact}
  />
);
