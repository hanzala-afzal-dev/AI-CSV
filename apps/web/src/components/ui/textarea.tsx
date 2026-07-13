import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full resize-none rounded-md border border-line bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
});
