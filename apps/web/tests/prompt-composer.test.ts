import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptComposer } from "../src/components/conversations/prompt-composer";

describe("PromptComposer", () => {
  it("renders hydration-stable disabled controls", () => {
    const markup = renderToStaticMarkup(
      createElement(PromptComposer, {
        value: "",
        onChange: () => undefined,
        onSubmit: () => undefined,
        onCancel: () => undefined,
        disabled: false,
        submitting: false,
        providerReady: null,
        datasetReady: false,
        attachmentDisabled: false,
        onAttach: () => undefined,
        run: null
      })
    );

    const attachButton = markup.match(/<button[^>]*aria-label="Attach CSV"[^>]*>/)?.[0];
    const sendButton = markup.match(/<button[^>]*aria-label="Send message"[^>]*>/)?.[0];

    expect(attachButton).toContain('disabled=""');
    expect(sendButton?.toLowerCase()).toContain('autocomplete="off"');
    expect(sendButton).toContain('disabled=""');
  });
});
