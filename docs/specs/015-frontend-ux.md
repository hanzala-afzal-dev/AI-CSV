# 015 — React Frontend UX

**Status:** Approved for implementation

## 1. Design direction

Use a clean, familiar conversational layout inspired by modern AI assistants without copying proprietary branding or exact visual assets. The UI should feel calm, production-ready and data-focused.

Preserve the existing React frontend setup. Add features incrementally using TypeScript, accessible components and a consistent design system.

## 2. Desktop layout

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

## 3. Navigation

Left sidebar:

- product name/logo
- new conversation button
- optional chat search
- recent conversations grouped by recency
- archive access
- settings/profile menu
- collapsible desktop state and mobile drawer

## 4. Chat empty state

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

## 5. Composer

- multiline textarea with auto-grow and keyboard shortcuts
- send button
- CSV attachment affordance only in MVP
- disabled/clear state while current run prevents another prompt
- stop/cancel action while running
- accessible labels and focus states

## 6. Message rendering

Assistant messages may render:

- markdown-safe text
- clarification card with quick options and free-text response
- chart card using trusted renderer
- compact data table
- warnings
- provenance disclosure panel
- follow-up suggestion chips

Never render model-provided raw HTML or code as executable UI.

## 7. Settings UI

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

## 8. States

Every async view requires:

- loading skeleton/progress
- empty state
- success state
- retryable error
- permanent validation error
- unauthorized/session expired handling

## 9. Accessibility

- WCAG AA-oriented contrast.
- Full keyboard navigation.
- Semantic landmarks and headings.
- Chart data has accessible table/summary alternative.
- Streaming updates use polite live regions without reading every token.
- Dialog focus trap and restoration.
- Do not communicate status by color alone.

## 10. Responsive behavior

- Sidebar becomes drawer on narrow screens.
- Charts resize without horizontal clipping; tables may scroll.
- Composer remains reachable above mobile browser UI.
- Settings use stacked sections.

## 11. Acceptance scenarios

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
