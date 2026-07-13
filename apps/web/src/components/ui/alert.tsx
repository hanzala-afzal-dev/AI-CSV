import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border border-line bg-subtle px-4 py-3 text-sm",
        className
      )}
      {...props}
    />
  );
}
