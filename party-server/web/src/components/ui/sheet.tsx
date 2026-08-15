import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn('absolute inset-0 z-50 bg-black/70', className)}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  container,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  container?: HTMLElement | null;
}) {
  return (
    <SheetPortal container={container ?? undefined}>
      <SheetOverlay />
      <DialogPrimitive.Content
        className={cn(
          'absolute inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card p-6 shadow-lg max-md:inset-0 max-md:max-w-none max-md:border-l-0 pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] rounded-full p-2 text-foreground hover:bg-white/10">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />;
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-bold', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
