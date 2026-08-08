import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptComposer } from "../src/components/conversations/prompt-composer";

describe("PromptComposer", () => {
  it("renders a hydration-stable disabled send control", () => {
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

    const sendButton = markup.match(/<button[^>]*aria-label="Send message"[^>]*>/)?.[0];

    expect(sendButton?.toLowerCase()).toContain('autocomplete="off"');
    expect(sendButton).toContain('disabled=""');
  });
});
