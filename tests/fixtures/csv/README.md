# Synthetic CSV fixtures

These files contain synthetic data only. They are shared inputs for manual end-to-end checks and the
deterministic analytics and 50-case Phase 9 evaluation suite.

- `sales_clean.csv`: valid upload and basic numerical profiling.
- `sales_dirty.csv`: deliberately malformed row for ingestion failure/retry checks.
- `marketing.csv`: channel and campaign comparisons.
- `support_text.csv`: bounded free-text and categorical columns.
- `ambiguous_revenue.csv`: deliberately ambiguous gross/net revenue terminology.
- `prompt_injection.csv`: hostile-looking cell values that must always remain inert data.

Run `pnpm eval:phase9` to regenerate the machine-readable and human-readable reports under
`docs/evaluation/`. No provider key or network request is used.
