import type { ReactNode } from "react";
import { requireCurrentSession } from "@/server/current-session";

export default async function ProtectedLayout({
  children
}: {
  readonly children: ReactNode;
}) {
  await requireCurrentSession();
  return children;
}
