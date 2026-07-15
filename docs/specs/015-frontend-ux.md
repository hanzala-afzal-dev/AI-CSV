# 015 — React Frontend UX

**Status:** Approved for implementation

## 1. Design direction

Use a clean, familiar conversational layout inspired by modern AI assistants without copying proprietary branding or exact visual assets. The UI should feel calm, production-ready and data-focused.

Preserve the existing React frontend setup. Add features incrementally using TypeScript, accessible components and a consistent design system.

## 2. Component architecture

Build the frontend component-first. Pages and layouts compose reusable components; they must not contain
large feature implementations or duplicate interaction patterns.

```text
apps/web/src/
  app/                  # routes, layouts, loading/error boundaries, page composition
  components/
    ui/                 # shared shadcn/ui primitives owned by this repository
    auth/               # reusable identity and session components
    conversations/      # conversation and message components
    datasets/           # upload, profile, and dataset components
    settings/           # account and provider-setting components
  features/             # feature hooks, client state, form orchestration, view models
  lib/                  # browser-safe API client and shared frontend utilities
```

Rules:

- Prefer composition and small focused components over configurable all-purpose components.
- Use shared primitives for buttons, inputs, forms, dialogs, menus, tabs, tables, alerts, skeletons,
  tooltips, and toasts.
- Keep feature-specific behavior in its feature component; promote it to `components/ui` only when it is
  genuinely generic and reused.
- Keep domain and authorization rules out of React. Components consume typed application-facing HTTP
  contracts.
- Use Server Components by default. Add `"use client"` only at the smallest interactive boundary.
- Every reusable interactive component exposes accessible labels, keyboard behavior, focus handling,
  disabled/loading states, and a stable typed API.
- Do not create wrapper components that merely rename every shadcn/ui prop. Wrap a primitive only to
  establish a real application convention or repeated behavior.

### shadcn/ui

Use shadcn/ui as the preferred source for accessible primitives where it fits the interaction. Generated
components live in `apps/web/src/components/ui` and become repository-owned source code. Install only
components required by an implemented feature; do not bulk-install the catalog. Preserve the project's
Tailwind design tokens and use Lucide icons supplied through the shadcn ecosystem where an appropriate
icon exists.

If shadcn/ui does not fit a specialized visualization or data interaction, build a focused accessible
component using the same tokens and composition conventions, and document a materially different design
system choice in an ADR.

## 3. Desktop layout

```text
┌──────────────────┬─────────────────────────────────────────────┐
│ New conversation │ Conversation title          Dataset badge   │
│ Search chats     ├─────────────────────────────────────────────┤
│                  │                                             │
│ Recent           │              Message timeline               │
│ conversations    │       text / tables / chart cards           │
│                  │                                             │
│                  ├─────────────────────────────────────────────┤
│ User / Settings  │ attach CSV | prompt composer | send         │
└──────────────────┴─────────────────────────────────────────────┘
```

## 4. Navigation

Left sidebar:

- product name/logo
- new conversation button
- optional chat search
- recent conversations grouped by recency
- archive access
- settings/profile menu
- collapsible desktop state and mobile drawer

## 5. Chat empty state

The Phase 4 shell renders the real persistent workspace, provider-readiness gate, safe suggested prompts,
and a disabled attachment affordance. It must not simulate an uploaded dataset. Phase 5 replaces that
affordance with the upload and ingestion states below; the conversation/sidebar/message components remain
the stable shell rather than being rebuilt for ingestion.

Before a dataset is ready:

- concise product explanation
- drag-and-drop/select CSV panel
- accepted type and configured limit
- privacy statement that each user's data is isolated
- no misleading generic graph examples presented as real user data

During ingestion:

- progress state: uploading, validating, profiling, indexing
- user may navigate away; status persists
- composer communicates when analysis is unavailable

After readiness:

- dataset summary card
- detected rows/columns
- 3–6 suggested prompt chips
- active dataset/version badge

## 6. Composer

- multiline textarea with auto-grow and keyboard shortcuts
- send button
- CSV attachment affordance only in MVP
- disabled/clear state while current run prevents another prompt
- stop/cancel action while running
- accessible labels and focus states

## 7. Message rendering

Assistant messages may render:

- markdown-safe text
- clarification card with quick options and free-text response
- chart card using trusted renderer
- compact data table
- warnings
- provenance disclosure panel
- follow-up suggestion chips

Never render model-provided raw HTML or code as executable UI.

## 8. Settings UI

### Profile

Editable display name and email change flow.

### Security

Current password, new password, confirmation and active-session list.

### OpenAI

- key status card
- password input for add/replace
- validate/save action
- last four only after save
- remove action with confirmation
- model select populated from validated catalog
- reasoning effort select
- explicit provider usage/cost notice: the open-source app does not bill users; provider charges may apply to their own account

## 9. States

Every async view requires:

- loading skeleton/progress
- empty state
- success state
- retryable error
- permanent validation error
- unauthorized/session expired handling

## 10. Accessibility

- WCAG AA-oriented contrast.
- Full keyboard navigation.
- Semantic landmarks and headings.
- Chart data has accessible table/summary alternative.
- Streaming updates use polite live regions without reading every token.
- Dialog focus trap and restoration.
- Do not communicate status by color alone.

## 11. Responsive behavior

- Sidebar becomes drawer on narrow screens.
- Charts resize without horizontal clipping; tables may scroll.
- Composer remains reachable above mobile browser UI.
- Settings use stacked sections.

## 12. Acceptance scenarios

```gherkin
Scenario: new user has no key
  Given a signed-in user has not configured OpenAI
  When they open chat
  Then the UI directs them to Settings before starting an AI run
  And does not request a provider call

Scenario: clarification card
  Given an agent requests clarification
  Then the question appears as an assistant message/card
  And the user can choose a suggested answer or type one
  And the response resumes the existing run

Scenario: chart accessibility
  Given an assistant response contains a chart
  Then an equivalent accessible summary or table is available
```
