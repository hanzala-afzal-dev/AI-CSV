---
name: filing-audit-findings
description: Use when filing code-review, security, performance, or architecture findings as GitHub issues on this repo - triggered by requests like "file these as issues", "write those to the repo", "open issues for these findings", "post the audit results", or "raise these with the bot". Covers attribution via the claudy-audit-bot GitHub App, deduplication against existing issues, the severity floor, and the issue body format.
---

# Filing audit findings as issues

The scan and the filing are two separate steps. This covers the second one:
findings already exist, and the user has asked to put them on GitHub.

## 1. Attribution is the whole point — use the wrapper

**Every GitHub write goes through `./bin/audit-gh`, never plain `gh`.**

```bash
./bin/audit-gh issue create --title "..." --body "..." --label claude-audit --label "severity:high"
```

`bin/audit-gh` mints a short-lived GitHub App installation token so issues are
authored by `claudy-audit-bot[bot]`. Plain `gh issue create` silently files
under the user's *personal* account and looks identical in the terminal — that
silent misattribution is the specific failure this setup exists to prevent.

A `PreToolUse` hook (`.claude/hooks/guard-gh.mjs`) blocks plain `gh issue|label`
writes as a backstop. Do not work around it; it is catching a real mistake.

Two environment notes that cause confusing failures:

- **`gh` must be on `PATH`.** On Windows it installs to
  `C:\Program Files\GitHub CLI` and the installer does not add it. Without it
  the wrapper dies with `gh: command not found`.
- **No leading slash on API endpoints.** Git Bash rewrites `/installation/...`
  into a Windows path. Use `./bin/audit-gh api installation/repositories`.

The App holds `issues: write` and `metadata: read` on this repo only. It
**cannot** push code or open PRs — those still need a personal account.

## 2. Deduplicate before creating anything

```bash
./bin/audit-gh issue list --label claude-audit --state all --limit 200 --json number,title,body
```

Skip any finding whose file + problem is already listed, **open or closed**. A
closed issue was fixed or rejected — re-raising it is noise. Match on the
underlying defect, not on title wording; the same bug reported twice with
different phrasing is still a duplicate.

## 3. Severity floor: drop everything below medium

- `critical` — exploitable, or causes data loss
- `high` — serious defect under normal load
- `medium` — real but bounded

Style, naming, and "consider refactoring" opinions are **not findings**. Neither
is anything located by grep alone without reading the surrounding code.

An empty run is a valid result. Never invent findings to fill a quota.

## 4. Confirm, then create

Show the surviving findings as a short numbered list, worst first, and **get
the user's go-ahead before creating anything.** Filing issues is outward-facing
and hard to undo quietly.

Ensure labels exist (idempotent, safe to re-run):

```bash
./bin/audit-gh label create claude-audit      --color 5319e7 --force
./bin/audit-gh label create severity:critical --color b60205 --force
./bin/audit-gh label create severity:high     --color d93f0b --force
./bin/audit-gh label create severity:medium   --color fbca04 --force
```

Then one issue per finding, **at most 8 per run**, with this body:

> **File:** `path/to/file.ts:120-135`
>
> **What's wrong** — two or three concrete sentences.
>
> **Why it matters** — the real consequence, not a generic warning.
>
> **Suggested fix** — a specific change, with a short snippet if one fits.
>
> ---
> Found by an automated audit run against `<commit sha>`. Close it if you
> disagree; it won't be raised again.

Get the sha with `git rev-parse --short HEAD`.

Finish by printing the issue numbers created. If a create fails, report the
exit code and raw output rather than assuming it worked.

## 5. Never commit secrets

Do not write the `.pem` path, a token, or any `gh` output containing a token
into a file that gets committed. The private key lives outside the repo.
