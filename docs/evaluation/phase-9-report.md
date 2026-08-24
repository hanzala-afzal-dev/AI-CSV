# Phase 9 deterministic evaluation

**Status:** passed

Corpus version 1; evaluator version 1; 50/50 cases passed.
No LLM or external provider is used. Numeric results run through the production DuckDB engine;
planning, chart validation and memory retrieval use their production application boundaries.

## Coverage

| Category            | Cases | Passed | Failed |
| ------------------- | ----: | -----: | -----: |
| average             |     2 |      2 |      0 |
| clarification       |     1 |      1 |      0 |
| correlation         |     2 |      2 |      0 |
| count               |     3 |      3 |      0 |
| distribution        |     3 |      3 |      0 |
| empty-result        |     1 |      1 |      0 |
| filter              |     4 |      4 |      0 |
| grouped-comparison  |     5 |      5 |      0 |
| invalid-request     |     1 |      1 |      0 |
| lookup              |     2 |      2 |      0 |
| maximum             |     1 |      1 |      0 |
| memory-non-reuse    |     1 |      1 |      0 |
| memory-reuse        |     1 |      1 |      0 |
| minimum             |     1 |      1 |      0 |
| missing-column      |     2 |      2 |      0 |
| missing-data        |     3 |      3 |      0 |
| numeric-result      |     2 |      2 |      0 |
| overview            |     1 |      1 |      0 |
| prompt-injection    |     2 |      2 |      0 |
| retrieval-isolation |     3 |      3 |      0 |
| sum                 |     2 |      2 |      0 |
| summary             |     1 |      1 |      0 |
| top-bottom          |     2 |      2 |      0 |
| trend               |     4 |      4 |      0 |

## Deterministic checks

- Exact or tolerance-bounded numeric rows and an independently recomputed result checksum.
- Stored column IDs, aggregations, filters, clarification state and time grains.
- Chart field existence and result-type compatibility.
- Required user, dataset and active-version vector filters plus authoritative hydration.
- Zero cross-user/version retrieval leakage and inert prompt-like retrieved content.

## Failures

None.
