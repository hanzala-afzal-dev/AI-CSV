#!/usr/bin/env node
// PreToolUse(Bash) guard: keep audit issues attributed to claudy-audit-bot[bot].
//
// Blocks plain `gh issue|label <write-verb>` and points at ./bin/audit-gh, which
// mints a GitHub App installation token. Without this, a plain `gh issue create`
// silently files under the caller's personal account -- the exact failure this
// repo's audit setup exists to prevent, and one that leaves no visible error.
//
// Reads (`list`, `view`) are untouched, and `gh pr ...` is deliberately NOT
// blocked: the App holds issues:write only, so PRs must use a personal account.
//
// Written as a regex literal, not new RegExp("..."): the string form needs
// doubled backslashes, and a single lost backslash turns \s into s and \b into
// a backspace character, silently disabling the guard.
//
// `gh` only counts as a command when the preceding character isn't part of a
// word or path. That leaves `./bin/audit-gh issue create` alone (preceded by
// `-`) while still catching `cd x && gh issue create` and `FOO=1 gh issue edit`.
const OFFENDER =
  /(?:^|[\s;&|(){}`])gh\s+(issue|label)\s+(create|edit|delete|close|reopen|comment|clone|lock|unlock|pin|unpin|transfer)\b/;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let command;
  try {
    command = JSON.parse(raw)?.tool_input?.command;
  } catch {
    return; // unparseable input: fail open, never wedge the session
  }
  if (typeof command !== "string") return;

  const match = OFFENDER.exec(command);
  if (!match) return;

  const [, noun, verb] = match;
  // No process.exit() here -- exiting can truncate a pending pipe write, which
  // would drop the deny and let the command through.
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: [
          `Blocked: plain \`gh ${noun} ${verb}\` writes as the personal GitHub`,
          `account, not as claudy-audit-bot[bot].`,
          ``,
          `Use the App wrapper instead:`,
          `  ./bin/audit-gh ${noun} ${verb} ...`,
          ``,
          `Reads like \`gh ${noun} list\` and all \`gh pr\` commands are unaffected;`,
          `the App holds issues:write only, so PRs still use your own account.`,
        ].join("\n"),
      },
    }),
  );
});
