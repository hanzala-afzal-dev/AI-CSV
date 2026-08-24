import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PrivacyDeletionDialog } from "../src/components/privacy/privacy-deletion-dialog";

describe("PrivacyDeletionDialog", () => {
  it("renders an accessible re-authentication form for datasets", () => {
    const html = renderToStaticMarkup(
      <PrivacyDeletionDialog
        open
        scope="dataset"
        resourceName="Sales"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(html).toContain("Delete dataset");
    expect(html).toContain('autoComplete="current-password"');
    expect(html).not.toContain('pattern="DELETE"');
  });

  it("requires the destructive account confirmation phrase", () => {
    const html = renderToStaticMarkup(
      <PrivacyDeletionDialog
        open
        scope="account"
        resourceName="Account"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(html).toContain("Delete account");
    expect(html).toContain('pattern="DELETE"');
    expect(html).toContain("every owned dataset");
  });
});
