import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const workspace = read("pnpm-workspace.yaml");
const lockfile = read("pnpm-lock.yaml");
const dependabot = read(".github/dependabot.yml");
const failures = [];

if (!/^pnpm@\d+\.\d+\.\d+$/.test(packageJson.packageManager ?? "")) {
  failures.push("packageManager must pin an exact pnpm version.");
}
if (!lockfile.startsWith("lockfileVersion:")) {
  failures.push("pnpm-lock.yaml is missing or invalid.");
}
if (!/^minimumReleaseAge:\s+10080$/m.test(workspace)) {
  failures.push("pnpm must enforce a seven-day minimum dependency release age.");
}
for (const override of [
  "nanoid: 3.3.18",
  "postcss: 8.5.23",
  "sharp: 0.35.0",
  "undici: 6.28.0"
]) {
  if (!workspace.includes(`  ${override}\n`)) {
    failures.push(`Security override is missing: ${override}.`);
  }
}
if (
  !/package-ecosystem:\s+npm/.test(dependabot) ||
  !/interval:\s+weekly/.test(dependabot)
) {
  failures.push("Weekly npm dependency review is not configured.");
}
if (packageJson.scripts?.["security:audit"] !== "pnpm audit --prod --audit-level=high") {
  failures.push("The high-severity production dependency audit command is missing.");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log("Dependency policy check passed.");
}
