import type { ReactNode } from "react";

export function Tooltip({
  content,
  children
}: {
  readonly content: string;
  readonly children: ReactNode;
}) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs font-medium text-white shadow-sm group-hover/tooltip:block group-focus-within/tooltip:block"
      >
        {content}
      </span>
    </span>
  );
}
