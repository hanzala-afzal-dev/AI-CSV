import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const rules = [
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g
  },
  {
    name: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g
  },
  {
    name: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g
  },
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  }
];

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
)
  .split("\0")
  .filter(Boolean);
const findings = [];

for (const file of files) {
  let metadata;
  try {
    metadata = statSync(file);
  } catch {
    continue;
  }
  if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const content = bytes.toString("utf8");
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      if (rule.name === "OpenAI API key" && /^sk-(?:test|invalid)-/.test(match[0])) {
        continue;
      }
      const line = content.slice(0, match.index).split("\n").length;
      findings.push({ file, line, rule: rule.name });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: possible ${finding.rule}`);
  }
  console.error("Secret scan failed. Values are intentionally not printed.");
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed ${files.length} repository files.`);
}
