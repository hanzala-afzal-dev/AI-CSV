# 011 — Suggestions and Verified Insights

**Status:** Approved for implementation

## 1. Two distinct concepts

### Suggested prompt

A question the user could ask. It is not a factual claim.

Example: “Compare total revenue by region.”

### Verified insight

A factual statement backed by an executed analysis result.

Example: “The North region has the highest revenue in this file.”

The UI and persistence model must distinguish them.

## 2. Initial suggestions

After dataset profiling, generate 3–6 prompts using schema and profile metadata, such as:

- dataset overview
- missing-data check
- top category comparison
- time trend when a date and numeric measure exist
- correlation when at least two meaningful numeric columns exist

Suggestions must reference actual columns or user-friendly resolved labels.

## 3. Follow-up suggestions

After a completed answer, generate up to 4 concise suggestions that extend current context:

- drill down by a dimension
- compare time periods
- inspect outliers
- test a related correlation
- explain missing data

Do not repeat the just-completed question.

## 4. Verified insight generation

Optional MVP enhancement:

- Define allow-listed profiling/analysis templates.
- Execute them deterministically.
- Ask the model only to phrase the results.
- Persist result artifact and provenance.

Never generate factual “insights” solely from column names or sampled rows.

## 5. Ranking

Rank suggestions by:

- compatibility with available column types
- relevance to current question/result
- diversity
- expected analytical usefulness
- execution safety/cost

## 6. Acceptance scenarios

```gherkin
Scenario: time suggestion only when valid
  Given a dataset has no date-like column
  When initial suggestions are generated
  Then no time-trend prompt is suggested

Scenario: verified insight provenance
  Given an insight states one category is highest
  Then it references a completed result artifact
  And the underlying query result supports the statement
```
