'use client';
import React from 'react';
import { View, Text as RNText } from 'react-native';
import {
  createToast,
  createToastHook,
} from '@gluestack-ui/core/toast/creator';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';

// ---------------------------------------------------------------------------
// useToast hook — reads/writes the ToastProvider that GluestackUIProvider
// already mounts in this app (see components/ui/gluestack-ui-provider).
// ---------------------------------------------------------------------------

export const useToast = createToastHook(View);

// ---------------------------------------------------------------------------
// Variants (canonical gluestack v5 Toast surface: `action` + `variant`).
// Uses semantic tokens only — no numbered colors — per project styling rules.
// ---------------------------------------------------------------------------

const toastStyle = tva({
  base: 'px-4 py-3 rounded-md flex-col gap-1 web:pointer-events-auto shadow-lg',
  variants: {
    action: {
      error: '',
      warning: '',
      success: '',
      info: '',
      muted: '',
    },
    variant: {
      solid: '',
      outline: 'border',
    },
  },
  compoundVariants: [
    // Solid backgrounds
    {
      action: 'error',
      variant: 'solid',
      class: 'bg-destructive',
    },
    {
      action: 'warning',
      variant: 'solid',
      class: 'bg-primary',
    },
    {
      action: 'success',
      variant: 'solid',
      class: 'bg-primary',
    },
    {
      action: 'info',
      variant: 'solid',
      class: 'bg-card',
    },
    {
      action: 'muted',
      variant: 'solid',
      class: 'bg-card',
    },
    // Outline (transparent bg, colored border)
    {
      action: 'error',
      variant: 'outline',
      class: 'bg-background border-destructive',
    },
    {
      action: 'warning',
      variant: 'outline',
      class: 'bg-background border-primary',
    },
    {
      action: 'success',
      variant: 'outline',
      class: 'bg-background border-primary',
    },
    {
      action: 'info',
      variant: 'outline',
      class: 'bg-background border-border',
    },
    {
      action: 'muted',
      variant: 'outline',
      class: 'bg-background border-border',
    },
  ],
  defaultVariants: {
    action: 'muted',
    variant: 'solid',
  },
});

const toastTitleStyle = tva({
  base: 'text-foreground font-semibold text-base',
  variants: {
    isTruncated: { true: 'truncate' },
    bold: { true: 'font-bold' },
    underline: { true: 'underline' },
    strikeThrough: { true: 'line-through' },
    size: {
      '2xs': 'text-2xs',
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const toastDescriptionStyle = tva({
  base: 'text-muted-foreground text-sm',
  variants: {
    isTruncated: { true: 'truncate' },
    bold: { true: 'font-bold' },
    underline: { true: 'underline' },
    strikeThrough: { true: 'line-through' },
    size: {
      '2xs': 'text-2xs',
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    },
  },
  defaultVariants: {
    size: 'sm',
  },
});

// ---------------------------------------------------------------------------
// Root / Title / Description primitives passed into gluestack's createToast.
// ---------------------------------------------------------------------------

type IToastRootProps = React.ComponentProps<typeof View> &
  VariantProps<typeof toastStyle>;

const ToastRoot = React.forwardRef<
  React.ComponentRef<typeof View>,
  IToastRootProps
>(function ToastRoot(
  { className, action = 'muted', variant = 'solid', ...props },
  ref,
) {
  return (
    <View
      ref={ref}
      {...props}
      className={toastStyle({ action, variant, class: className })}
    />
  );
});

type IToastTitleProps = React.ComponentProps<typeof RNText> &
  VariantProps<typeof toastTitleStyle>;

const ToastTitleRoot = React.forwardRef<
  React.ComponentRef<typeof RNText>,
  IToastTitleProps
>(function ToastTitleRoot(
  { className, size, isTruncated, bold, underline, strikeThrough, ...props },
  ref,
) {
  return (
    <RNText
      ref={ref}
      {...props}
      className={toastTitleStyle({
        size,
        isTruncated: isTruncated as boolean,
        bold: bold as boolean,
        underline: underline as boolean,
        strikeThrough: strikeThrough as boolean,
        class: className,
      })}
    />
  );
});

type IToastDescriptionProps = React.ComponentProps<typeof RNText> &
  VariantProps<typeof toastDescriptionStyle>;

const ToastDescriptionRoot = React.forwardRef<
  React.ComponentRef<typeof RNText>,
  IToastDescriptionProps
>(function ToastDescriptionRoot(
  { className, size, isTruncated, bold, underline, strikeThrough, ...props },
  ref,
) {
  return (
    <RNText
      ref={ref}
      {...props}
      className={toastDescriptionStyle({
        size,
        isTruncated: isTruncated as boolean,
        bold: bold as boolean,
        underline: underline as boolean,
        strikeThrough: strikeThrough as boolean,
        class: className,
      })}
    />
  );
});

// ---------------------------------------------------------------------------
// createToast wires Root/Title/Description into a single Toast component with
// attached sub-components (Toast.Title, Toast.Description).
// ---------------------------------------------------------------------------

const ToastBase = createToast({
  Root: ToastRoot,
  Title: ToastTitleRoot,
  Description: ToastDescriptionRoot,
});

const Toast = ToastBase;
const ToastTitle = ToastBase.Title;
const ToastDescription = ToastBase.Description;

Toast.displayName = 'Toast';
ToastTitle.displayName = 'ToastTitle';
ToastDescription.displayName = 'ToastDescription';

export { Toast, ToastTitle, ToastDescription };
