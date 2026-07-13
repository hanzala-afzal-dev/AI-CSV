"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authenticatedMutation } from "@/features/identity/api";

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await authenticatedMutation("/api/v1/auth/logout", "POST", {});
        } finally {
          window.location.assign("/login");
        }
      }}
    >
      <LogOut size={16} />
      Sign out
    </Button>
  );
}
