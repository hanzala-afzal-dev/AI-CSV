import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface KnowledgeDocument {
  readonly path: string;
  readonly content: string;
}

export async function loadMarkdownKnowledgeDocuments(
  rootDirectory: string
): Promise<KnowledgeDocument[]> {
  const documents: KnowledgeDocument[] = [];
  await collectMarkdown(rootDirectory, rootDirectory, documents);
  return documents;
}

async function collectMarkdown(
  rootDirectory: string,
  currentDirectory: string,
  documents: KnowledgeDocument[]
): Promise<void> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdown(rootDirectory, absolutePath, documents);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      documents.push({
        path: absolutePath.replace(`${rootDirectory}/`, ""),
        content: await readFile(absolutePath, "utf8")
      });
    }
  }
}
