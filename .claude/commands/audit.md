---
description: Deep-scan this repo for security, performance and correctness problems, then open a GitHub issue for each finding
argument-hint: [path]
allowed-tools: Read, Glob, Grep, Bash(./bin/audit-gh:*), Bash(git log:*), Bash(git diff:*), Bash(rg:*)
model: Opus 4.8
disable-model-invocation: true
---

Audit this repository. Scope: $ARGUMENTS (default to the whole repo if empty).

**All GitHub calls go through `./bin/audit-gh`, never plain `gh`.** That wrapper
authenticates as the audit App so issues are attributed to a bot, not to me.

## 1. Read before you judge

Open files and follow the call paths. Do not report anything you found by grep
alone and did not actually read. Ignore `vendor/`, `node_modules/`, `dist/`,
`build/`, `*.min.*`, lock files, and test fixtures.

## 2. What counts as a finding

**Security** — string-interpolated SQL or unparameterised queries; shell/eval on
user input; missing authorisation on a route or endpoint; IDOR (record fetched
by ID with no ownership check); mass assignment; committed secrets; unescaped
output or `dangerouslySetInnerHTML` on untrusted data; missing CSRF or rate
limiting on state-changing routes; path traversal in file handling.

**Performance** — N+1 queries (ORM access inside a loop, missing eager loading);
filtering or joining on an unindexed column; unbounded result sets with no
pagination; blocking I/O in a request handler that belongs on a queue; React
work repeated every render, effects that refetch in a loop, long unvirtualised
lists; cache written with no invalidation path.

**Correctness** — swallowed exceptions, unhandled rejections, race conditions,
non-atomic read-modify-write, multi-write operations with no transaction.

Severity: `critical` (exploitable or data loss), `high` (serious defect under
normal load), `medium` (real but bounded). **Drop everything below medium.**
Style, naming and "consider refactoring" opinions are not findings.

## 3. Deduplicate — do this before creating anything

```
./bin/audit-gh issue list --label claude-audit --state all --limit 200 --json number,title,body
```

Skip any finding whose file + problem is already there, **open or closed**. A
closed issue means it was fixed or rejected — do not raise it again.

## 4. Post

Make sure the labels exist first (safe to re-run):

```
./bin/audit-gh label create claude-audit      --color 5319e7 --force
./bin/audit-gh label create severity:critical --color b60205 --force
./bin/audit-gh label create severity:high     --color d93f0b --force
./bin/audit-gh label create severity:medium   --color fbca04 --force
```

Show me the surviving findings as a short numbered list, worst first. Then open
one issue for each, at most 8 per run:

```
./bin/audit-gh issue create --title "<short and specific>" --body "<below>" \
  --label claude-audit --label "severity:<level>"
```

Body:

> **File:** `path/to/file.php:120-135`
>
> **What's wrong** — two or three concrete sentences.
>
> **Why it matters** — the real consequence, not a generic warning.
>
> **Suggested fix** — a specific change, with a short snippet if one fits.
>
> ---
> Found by an automated audit run against `<current commit sha>`. Close it if
> you disagree; it won't be raised again.

Finish by printing the issue numbers you created.

If nothing reaches medium, say so and create nothing. An empty run is a valid
result — do not invent findings to fill the quota.
