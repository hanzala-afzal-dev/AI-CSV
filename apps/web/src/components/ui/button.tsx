import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        primary: "bg-action text-white hover:bg-action-strong",
        secondary: "border border-line bg-panel text-ink hover:bg-subtle",
        ghost: "text-muted hover:bg-subtle hover:text-ink",
        danger: "bg-danger text-white hover:bg-danger-strong"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        icon: "size-10 p-0"
      }
    },
    defaultVariants: { variant: "primary", size: "default" }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
