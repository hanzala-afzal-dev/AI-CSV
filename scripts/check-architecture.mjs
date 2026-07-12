import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const modules = [
  {
    name: "domain",
    directory: "packages/domain",
    allowedWorkspaceDependencies: [],
    forbiddenSourceImports: [
      "react",
      "next",
      "drizzle-orm",
      "bullmq",
      "redis",
      "@qdrant/",
      "@langchain/",
      "@aws-sdk/"
    ]
  },
  {
    name: "contracts",
    directory: "packages/contracts",
    allowedWorkspaceDependencies: [],
    forbiddenSourceImports: ["react", "next", "drizzle-orm", "bullmq"]
  },
  {
    name: "application",
    directory: "packages/application",
    allowedWorkspaceDependencies: ["@agentic-csv/contracts", "@agentic-csv/domain"],
    forbiddenSourceImports: ["react", "next", "drizzle-orm", "bullmq", "redis"]
  },
  {
    name: "infrastructure",
    directory: "packages/infrastructure",
    allowedWorkspaceDependencies: [
      "@agentic-csv/application",
      "@agentic-csv/contracts",
      "@agentic-csv/domain"
    ],
    forbiddenSourceImports: [
      "@agentic-csv/web",
      "@agentic-csv/worker",
      "@agentic-csv/agent"
    ]
  },
  {
    name: "agent",
    directory: "packages/agent",
    allowedWorkspaceDependencies: [
      "@agentic-csv/application",
      "@agentic-csv/contracts",
      "@agentic-csv/domain"
    ],
    forbiddenSourceImports: [
      "@agentic-csv/infrastructure",
      "@agentic-csv/web",
      "@agentic-csv/worker"
    ]
  }
];

const violations = [];

for (const module of modules) {
  const packageDirectory = path.join(root, module.directory);
  const manifest = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8")
  );
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  };

  for (const dependency of Object.keys(dependencies)) {
    if (
      dependency.startsWith("@agentic-csv/") &&
      !module.allowedWorkspaceDependencies.includes(dependency)
    ) {
      violations.push(
        `${module.directory}/package.json: ${module.name} cannot depend on ${dependency}`
      );
    }
  }

  const sourceDirectory = path.join(packageDirectory, "src");
  for (const filename of await sourceFiles(sourceDirectory)) {
    const source = await readFile(filename, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const workspaceDependency = workspacePackageName(specifier);
      if (
        module.forbiddenSourceImports.some((prefix) => matchesPrefix(specifier, prefix))
      ) {
        violations.push(
          `${path.relative(root, filename)}: ${module.name} cannot import ${specifier}`
        );
      }

      if (
        workspaceDependency &&
        !module.allowedWorkspaceDependencies.includes(workspaceDependency)
      ) {
        violations.push(
          `${path.relative(root, filename)}: ${module.name} cannot import ${specifier}`
        );
      }

      if (specifier.startsWith(".")) {
        const resolvedImport = path.resolve(path.dirname(filename), specifier);
        if (!resolvedImport.startsWith(`${packageDirectory}${path.sep}`)) {
          violations.push(
            `${path.relative(root, filename)}: ${module.name} cannot use a cross-package relative import (${specifier})`
          );
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary violations:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries are valid.");
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(filename);
      }
      return /\.[cm]?[jt]sx?$/.test(entry.name) ? [filename] : [];
    })
  );
  return files.flat();
}

function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function matchesPrefix(specifier, prefix) {
  return prefix.endsWith("/")
    ? specifier.startsWith(prefix)
    : specifier === prefix || specifier.startsWith(`${prefix}/`);
}

function workspacePackageName(specifier) {
  return /^(@agentic-csv\/[^/]+)/.exec(specifier)?.[1];
}
