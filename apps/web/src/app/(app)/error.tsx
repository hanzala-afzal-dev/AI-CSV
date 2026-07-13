"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function AppError({ reset }: { readonly reset: () => void }) {
  return (
    <main className="page-shell">
      <Alert className="border-danger/30 bg-danger-soft text-danger-strong">
        <h1 className="font-bold">This view could not be loaded.</h1>
        <p className="mt-1">
          Retry the request. Sign in again if your session has expired.
        </p>
        <Button className="mt-4" variant="secondary" onClick={reset}>
          Retry
        </Button>
      </Alert>
    </main>
  );
}
