import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable } from '@/components/ui/pressable';
import { isTV } from '@/src/utils/tv';

interface FocusableProps {
  children: ReactNode | ((focused: boolean) => ReactNode);
  onPress?: () => void;
  onLongPress?: () => void;
  className?: string;
  /** Applied only while the element holds TV focus. */
  focusedClassName?: string;
  hasTVPreferredFocus?: boolean;
}

/**
 * Pressable wrapper that exposes TV focus state so callers can render a
 * Netflix-style focus ring / scale. On phones it behaves like a Pressable.
 */
export const Focusable = forwardRef<
  React.ComponentRef<typeof Pressable>,
  FocusableProps
>(function Focusable(
  {
    children,
    onPress,
    onLongPress,
    className,
    focusedClassName,
    hasTVPreferredFocus,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      ref={ref}
      focusable
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`${className ?? ''} ${isTV && focused ? (focusedClassName ?? '') : ''}`}
    >
      {typeof children === 'function' ? children(focused) : children}
    </Pressable>
  );
});
