"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PrivacyDeletionDialog } from "@/components/privacy/privacy-deletion-dialog";
import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/features/privacy/api";

export function AccountDeletionControl() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        <Trash2 size={16} />
        Delete account
      </Button>
      <PrivacyDeletionDialog
        open={open}
        scope="account"
        resourceName="Account"
        onOpenChange={setOpen}
        onConfirm={async (currentPassword, confirmation) => {
          if (confirmation !== "DELETE") {
            throw new Error('Type "DELETE" to confirm account deletion.');
          }
          await deleteAccount(currentPassword, confirmation);
          router.replace("/login");
          router.refresh();
        }}
      />
    </>
  );
}
