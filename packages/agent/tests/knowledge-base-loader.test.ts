import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTrustedAgentPolicies, trustedAgentPolicyPaths } from "../src";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("trusted knowledge-base policy loader", () => {
  it("loads only the fixed reviewed policy allowlist in deterministic order", async () => {
    const root = await createKnowledgeBase();
    await writeFile(join(root, "policies", "unreviewed.md"), "must not be loaded");

    const policy = await loadTrustedAgentPolicies(root);

    expect(policy).not.toContain("must not be loaded");
    expect(trustedAgentPolicyPaths.every((path) => policy.includes(path))).toBe(true);
    expect(policy.indexOf(trustedAgentPolicyPaths[0])).toBeLessThan(
      policy.indexOf(trustedAgentPolicyPaths[1])
    );
  });

  it("rejects an allow-listed path that resolves outside the knowledge base", async () => {
    const outsideRoot = await createTemporaryDirectory("agentic-csv-kb-outside-");
    const outside = join(outsideRoot, "outside-policy.md");
    await writeFile(outside, "outside");
    const isolatedRoot = await createTemporaryDirectory("agentic-csv-kb-link-");
    await mkdir(join(isolatedRoot, "policies"), { recursive: true });
    await Promise.all(
      trustedAgentPolicyPaths
        .slice(1)
        .map((path) => writeFile(join(isolatedRoot, path), `# ${path}`))
    );
    await symlink(outside, join(isolatedRoot, trustedAgentPolicyPaths[0]));

    await expect(loadTrustedAgentPolicies(isolatedRoot)).rejects.toThrow(
      "resolves outside the knowledge base"
    );
  });
});

async function createKnowledgeBase(): Promise<string> {
  const root = await createTemporaryDirectory("agentic-csv-kb-");
  await mkdir(join(root, "policies"), { recursive: true });
  await Promise.all(
    trustedAgentPolicyPaths.map((path) => writeFile(join(root, path), `# ${path}`))
  );
  return root;
}

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  return path;
}
