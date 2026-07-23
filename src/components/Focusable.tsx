import { forwardRef, useState, type ReactNode } from 'react';
import type { Insets, StyleProp, ViewStyle } from 'react-native';
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
  /** Expands the touch/press target without affecting layout. */
  hitSlop?: Insets | number;
  /** Escape hatch for layout that can't be expressed via className (e.g. dynamic safe-area offsets). */
  style?: StyleProp<ViewStyle>;
  /** Fires whenever this element gains/loses TV focus. Useful for parents that need to react (e.g. a collapsible rail expanding while one of its rows is focused). */
  onFocusChange?: (focused: boolean) => void;
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
    hitSlop,
    style,
    onFocusChange,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      ref={ref}
      focusable
      hasTVPreferredFocus={hasTVPreferredFocus}
      hitSlop={hitSlop}
      style={style}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={() => {
        setFocused(true);
        onFocusChange?.(true);
      }}
      onBlur={() => {
        setFocused(false);
        onFocusChange?.(false);
      }}
      className={`${className ?? ''} ${isTV && focused ? (focusedClassName ?? '') : ''}`}
    >
      {typeof children === 'function' ? children(focused) : children}
    </Pressable>
  );
});
