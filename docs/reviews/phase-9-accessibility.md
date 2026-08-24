# Phase 9 accessibility review

**Reviewed:** 2026-08-23
**Target:** WCAG 2.2 AA-oriented primary CSV conversation workflow.

## Verified implementation

- The application uses semantic navigation, main, section, article, heading, form, table and status
  structures. Icon-only actions have accessible names.
- Prompt suggestions are native buttons, wrap long labels, preserve visible focus and use the normal
  protected composer submission path. Loading is announced without announcing every stream token.
- The prompt composer, clarification form and deletion forms have programmatic labels, disabled and
  busy states, keyboard submission and visible validation/error states.
- Dialogs use the native modal element for focus trapping and Escape behavior, then restore the
  previously focused control when closed.
- Every chart is paired with its deterministic result table under the keyboard-operable Data and
  provenance disclosure. Tables now include a screen-reader caption and horizontal overflow is
  contained on narrow viewports.
- Status is not color-only: success, warning, error, upload and run states include text and/or icons.
- Body/muted/action/danger/warning text tokens exceed 4.5:1 against the panel surface. The focus token
  was darkened to #5a9489, exceeding 3:1 against panel and subtle surfaces.
- Stable chart/table/button dimensions and min-width constraints prevent dynamic content from
  overlapping the composer or page controls.

## Manual release matrix

Before a tagged release, check the primary workflow in current Firefox and Chromium at 200% zoom and
at 390px, 768px and 1440px widths:

1. Navigate sidebar, settings, upload, suggestion, composer, clarification, chart disclosure and
   deletion controls using only Tab, Shift+Tab, Enter, Space and Escape.
2. Confirm focus is visible, modal focus cannot escape, and focus returns to the opener.
3. Confirm live upload/run states are announced once and do not read every streamed token.
4. Confirm long column names, prompts, errors and table values wrap or scroll without overlap.
5. Confirm chart values remain available in the equivalent data table.

Browser automation and axe/Playwright are not part of the current repository scope by product
direction. This manual matrix remains a release operation, not a claim of formal accessibility
certification.
