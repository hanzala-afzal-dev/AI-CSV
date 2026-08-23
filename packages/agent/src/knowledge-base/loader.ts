import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface KnowledgeDocument {
  readonly path: string;
  readonly content: string;
}

export const trustedAgentPolicyPaths = [
  "policies/analytical-safety.md",
  "policies/tenant-isolation.md",
  "policies/prompt-injection.md",
  "policies/chart-selection.md"
] as const;

const MAX_POLICY_CHARACTERS = 32_000;
const MAX_COMBINED_POLICY_CHARACTERS = 96_000;

export async function loadTrustedAgentPolicies(rootDirectory: string): Promise<string> {
  const canonicalRoot = await realpath(rootDirectory);
  const documents = await Promise.all(
    trustedAgentPolicyPaths.map((path) => loadPolicy(canonicalRoot, path))
  );
  const policy = documents
    .map((document) => `Policy: ${document.path}\n${document.content.trim()}`)
    .join("\n\n");

  if (policy.length > MAX_COMBINED_POLICY_CHARACTERS) {
    throw new Error("Trusted agent policies exceed the combined size limit.");
  }
  return policy;
}

async function loadPolicy(
  canonicalRoot: string,
  policyPath: (typeof trustedAgentPolicyPaths)[number]
): Promise<KnowledgeDocument> {
  const canonicalPath = await realpath(resolve(canonicalRoot, policyPath));
  const relativePath = relative(canonicalRoot, canonicalPath);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Trusted policy resolves outside the knowledge base: ${policyPath}`);
  }

  const content = await readFile(canonicalPath, "utf8");
  if (content.length === 0 || content.length > MAX_POLICY_CHARACTERS) {
    throw new Error(`Trusted policy has an invalid size: ${policyPath}`);
  }
  return { path: policyPath, content };
}
