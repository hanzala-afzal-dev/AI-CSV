import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-line bg-panel px-3 text-base text-ink outline-none transition focus:border-action focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70 sm:text-sm",
        className
      )}
      {...props}
    />
  );
}
