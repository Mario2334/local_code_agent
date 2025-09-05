import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { embedMany } from "ai";
import {openai} from "@ai-sdk/openai";
import {ChromaVector} from "@mastra/chroma";

export type CollectedFile = {
  path: string;
  name: string;
  framework: string;
  language: string;
  content: string;
};

const DEFAULT_INCLUDE = [
  "**/*.java",
  "**/*.py",
  "**/*.js",
  "**/*.ts",
  "**/*.properties",
  "**/*.yml",
  "**/*.yaml",
  "**/pom.xml",
  "**/build.gradle",
  "**/build.gradle.kts",
  "**/settings.gradle",
  "**/settings.gradle.kts",
  "**/pyproject.toml",
  "**/poetry.lock",
  "**/package.json",
  "**/README.md",
  "**/README",
  "**/*.md",
];

const DEFAULT_EXCLUDE_DIRS = new Set([
  ".git",
  "target",
  "build",
  ".gradle",
  ".idea",
  ".vscode",
  "node_modules",
]);

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (DEFAULT_EXCLUDE_DIRS.has(entry.name)) continue;
      await walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function micromatch(filePath: string, patterns: string[]): boolean {
  const toRegex = (pattern: string) =>
      new RegExp(
          "^" +
          pattern
              .replace(/[.+^${}()|[\]\\]/g, "\\$&")
              .replace(/\*\*/g, "(.+)")
              .replace(/\*/g, "([^/]*)") +
          "$"
      );
  return patterns.some((p) => toRegex(p).test(filePath));
}

function detectLanguage(filePath: string): string {
  if (filePath.endsWith(".java")) return "java";
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".ts")) return "typescript";
  if (filePath.endsWith(".js")) return "javascript";
  if (filePath.endsWith(".md")) return "markdown";
  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) return "yaml";
  if (filePath.endsWith(".properties")) return "properties";
  if (filePath.endsWith(".xml")) return "xml";
  if (filePath.endsWith(".json") || filePath.endsWith(".toml") || filePath.endsWith(".lock")) return "config";
  return "text";
}

// simple chunker for now
function chunkText(text: string, chunkSize = 1000): string[] {
  return text.match(new RegExp(`.{1,${chunkSize}}`, "gs")) || [];
}

export const collectCodeTool = createTool({
  id: "collect-code",
  description: "Collect and index code files into Chroma DB (via Mastra VectorStore)",
  inputSchema: z.object({
    root: z.string().describe("Absolute or relative path to project root"),
    framework: z.string().default("springboot"),
    include: z.array(z.string()).default(DEFAULT_INCLUDE).optional(),
    maxFileSizeBytes: z.number().default(2 * 1024 * 1024).optional(),
    outFile: z
        .string()
        .default(path.resolve(".mastra/output/code_index.json"))
        .optional(),
  }),
  outputSchema: z.object({
    indexedCount: z.number(),
    outFile: z.string(),
  }),
  execute: async ({ context }) => {
    const root = path.resolve(context.root);
    const include = context.include ?? DEFAULT_INCLUDE;
    const maxSize = context.maxFileSizeBytes ?? 2 * 1024 * 1024;
    const outFile = context.outFile ?? path.resolve(".mastra/output/code_index.json");

    const allFiles = await walk(root);
    const matched = allFiles.filter((f) => {
      const rel = path.relative(root, f);
      const normalized = rel.split(path.sep).join("/");
      return micromatch(normalized, include);
    });

    const collected: CollectedFile[] = [];

    await fs.mkdir(path.dirname(outFile), { recursive: true });

    // Create VectorStore
    const vectorStore = new ChromaVector();
    vectorStore.createIndex({
      indexName: "code_agent",
      dimension: 1536
    })

    for (const f of matched) {
      try {
        const stat = await fs.stat(f);
        if (stat.size > maxSize) continue;

        const content = await fs.readFile(f, "utf-8");

        const fileData: CollectedFile = {
          path: path.resolve(f),
          name: path.basename(f),
          framework: context.framework,
          language: detectLanguage(f),
          content,
        };
        collected.push(fileData);

        // chunk + embed
        const chunks = chunkText(content);
        const { embeddings } = await embedMany({
          model: openai.textEmbeddingModel("text-embedding-3-small"),
          values: chunks,
        });

        await vectorStore.upsert({
          indexName: "mastra-code",
          vectors: embeddings,
          metadata: chunks.map((_, i) => ({
            path: fileData.path,
            name: fileData.name,
            framework: fileData.framework,
            language: fileData.language,
            chunkIndex: i,
          })),
        });
      } catch {
        // ignore errors
      }
    }

    await fs.writeFile(outFile, JSON.stringify(collected, null, 2), "utf-8");

    return { indexedCount: collected.length, outFile };
  },
});
