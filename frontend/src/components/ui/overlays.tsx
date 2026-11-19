"use client";

// Dialog, Sheet (slide-over), Popover, DropdownMenu and Checkbox on Radix primitives.
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, Minus, X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ Dialog

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ title, description, children, className, footer }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[1200] animate-fade-in bg-black/50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[1201] flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 animate-zoom-in flex-col rounded-2xl border border-border bg-surface shadow-pop",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold text-fg">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ------------------------------------------------------------------- Sheet

export function Sheet({ open, onOpenChange, title, description, children, footer, side = "right", className }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; side?: "right" | "left"; className?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1200] animate-fade-in bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 z-[1201] flex w-full flex-col border-border bg-surface shadow-pop sm:max-w-xl",
            side === "right" ? "right-0 animate-slide-in-right border-l" : "left-0 border-r",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-base font-semibold text-fg">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-xs text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">Details</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ----------------------------------------------------------------- Popover

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = "end", ...props }: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={8} className={cn("z-[1250] animate-zoom-in rounded-xl border border-border bg-surface shadow-pop outline-none", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

// ------------------------------------------------------------ DropdownMenu

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;

export function DropdownMenuContent({ className, align = "end", ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content align={align} sideOffset={8} className={cn("z-[1250] min-w-48 animate-zoom-in rounded-xl border border-border bg-surface p-1 shadow-pop", className)} {...props} />
    </DropdownPrimitive.Portal>
  );
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownPrimitive.Item
      ref={ref}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-fg-soft outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted",
        destructive && "text-danger data-[highlighted]:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
});

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem className={cn("relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-sm text-fg-soft outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg", className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn("px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <DropdownPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />;
}

// ---------------------------------------------------------------- Checkbox

export function Checkbox({ className, checked, ...props }: ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      className={cn("flex size-4 shrink-0 items-center justify-center rounded border border-border-strong bg-surface transition data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary text-primary-fg", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator>{checked === "indeterminate" ? <Minus className="size-3" /> : <Check className="size-3" />}</CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
