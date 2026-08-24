import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptSuggestions } from "../src/components/conversations/prompt-suggestions";

describe("PromptSuggestions", () => {
  it("renders exact visible prompts as keyboard-operable actions", () => {
    const prompt = 'Compare total "Revenue" by "Region".';
    const markup = renderToStaticMarkup(
      createElement(PromptSuggestions, {
        suggestions: [
          {
            id: "suggestion_0123456789abcdef01234567",
            source: "initial_profile",
            kind: "comparison",
            displayText: prompt,
            promptText: prompt,
            referencedColumnIds: [
              "11111111-1111-4111-8111-111111111111",
              "22222222-2222-4222-8222-222222222222"
            ],
            basedOnResultId: null
          }
        ],
        loading: false,
        disabled: false,
        onSelect: () => undefined
      })
    );

    expect(markup).toContain('aria-label="Suggested questions"');
    expect(markup).toContain("Compare total &quot;Revenue&quot; by &quot;Region&quot;.");
    expect(markup).not.toContain("disabled");
  });

  it("announces loading without rendering stale actions", () => {
    const markup = renderToStaticMarkup(
      createElement(PromptSuggestions, {
        suggestions: [],
        loading: true,
        disabled: false,
        onSelect: () => undefined
      })
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("<button");
  });
});
