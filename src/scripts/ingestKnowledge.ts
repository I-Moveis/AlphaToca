import { promises as fs } from "fs";
import * as path from "path";
import { createHash } from "crypto";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";

import prisma from "../config/db";
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  getOpenAIApiKey,
} from "../config/rag";

export interface ChunkRecord {
  sourcePath: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  title: string;
}

export interface IngestSummary {
  files: number;
  inserted: number;
  updated: number;
  skipped: number;
  deleted: number;
}

export interface Embedder {
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export interface TextChunker {
  splitText(text: string): Promise<string[]>;
}

export type PrismaIngestClient = Pick<
  PrismaClient,
  "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction"
>;

export const EMBEDDING_BATCH_SIZE = 100;

export interface IngestDeps {
  prisma: PrismaIngestClient;
  embedder: Embedder;
  splitter: TextChunker;
  listMarkdownFiles: () => Promise<string[]>;
  readFile: (filePath: string) => Promise<string>;
}

interface ExistingRow {
  id: string;
  source_path: string;
  chunk_index: number;
  content_hash: string;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function deriveTitle(filePath: string, chunkIndex: number): string {
  const base = path.basename(filePath, path.extname(filePath));
  return `${base}#${chunkIndex}`;
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.toLowerCase().endsWith(".md")) {
        out.push(full);
      }
    }
  }
  await walk(root);
  out.sort();
  return out;
}

export async function buildChunksForFile(
  filePath: string,
  text: string,
  splitter: TextChunker,
): Promise<ChunkRecord[]> {
  const pieces = await splitter.splitText(text);
  return pieces.map((content, chunkIndex) => ({
    sourcePath: filePath,
    chunkIndex,
    content,
    contentHash: hashContent(content),
    title: deriveTitle(filePath, chunkIndex),
  }));
}

export async function runIngestion(deps: IngestDeps): Promise<IngestSummary> {
  const files = await deps.listMarkdownFiles();
  const summary: IngestSummary = {
    files: files.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
  };

  const allChunks: ChunkRecord[] = [];
  for (const file of files) {
    const text = await deps.readFile(file);
    const chunks = await buildChunksForFile(file, text, deps.splitter);
    allChunks.push(...chunks);
  }

  const sourcePaths = Array.from(new Set(allChunks.map((c) => c.sourcePath)));
  const existingRows =
    sourcePaths.length === 0
      ? []
      : await deps.prisma.$queryRawUnsafe<ExistingRow[]>(
          `SELECT id, source_path, chunk_index, content_hash
           FROM knowledge_documents
           WHERE source_path = ANY($1::text[])`,
          sourcePaths,
        );

  const existingByKey = new Map<string, ExistingRow>();
  for (const row of existingRows) {
    existingByKey.set(`${row.source_path}|${row.chunk_index}`, row);
  }

  type Action =
    | { type: "insert"; chunk: ChunkRecord }
    | { type: "update"; chunk: ChunkRecord; existingId: string };

  const actions: Action[] = [];
  const toEmbed: ChunkRecord[] = [];

  for (const chunk of allChunks) {
    const key = `${chunk.sourcePath}|${chunk.chunkIndex}`;
    const existing = existingByKey.get(key);
    if (!existing) {
      actions.push({ type: "insert", chunk });
      toEmbed.push(chunk);
    } else if (existing.content_hash === chunk.contentHash) {
      summary.skipped++;
    } else {
      actions.push({ type: "update", chunk, existingId: existing.id });
      toEmbed.push(chunk);
    }
  }

  const embeddings: number[][] = [];
  if (toEmbed.length > 0) {
    for (let start = 0; start < toEmbed.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = toEmbed.slice(start, start + EMBEDDING_BATCH_SIZE);
      const vectors = await deps.embedder.embedDocuments(
        batch.map((c) => c.content),
      );
      if (vectors.length !== batch.length) {
        throw new Error(
          `[ingest:knowledge] embedder returned ${vectors.length} vectors for ${batch.length} chunks in batch starting at ${start}`,
        );
      }
      embeddings.push(...vectors);
    }
  }

  if (embeddings.length !== toEmbed.length) {
    throw new Error(
      `[ingest:knowledge] embedder returned ${embeddings.length} vectors for ${toEmbed.length} chunks`,
    );
  }

  const embeddingByKey = new Map<string, number[]>();
  for (let i = 0; i < toEmbed.length; i++) {
    const chunk = toEmbed[i];
    embeddingByKey.set(`${chunk.sourcePath}|${chunk.chunkIndex}`, embeddings[i]);
  }

  const desiredKeys = new Set(
    allChunks.map((c) => `${c.sourcePath}|${c.chunkIndex}`),
  );
  const rowsToDelete = existingRows.filter(
    (row) => !desiredKeys.has(`${row.source_path}|${row.chunk_index}`),
  );

  await deps.prisma.$transaction(async (tx) => {
    for (const action of actions) {
      const chunk = action.chunk;
      const key = `${chunk.sourcePath}|${chunk.chunkIndex}`;
      const vector = embeddingByKey.get(key);
      if (!vector) {
        throw new Error(`[ingest:knowledge] missing embedding for ${key}`);
      }
      const vectorLiteral = toVectorLiteral(vector);

      if (action.type === "insert") {
        await tx.$executeRawUnsafe(
          `INSERT INTO knowledge_documents
             (id, title, content, embedding, source_path, chunk_index, content_hash, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3::vector, $4, $5, $6, now())`,
          chunk.title,
          chunk.content,
          vectorLiteral,
          chunk.sourcePath,
          chunk.chunkIndex,
          chunk.contentHash,
        );
        summary.inserted++;
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE knowledge_documents
             SET title = $1,
                 content = $2,
                 embedding = $3::vector,
                 content_hash = $4,
                 updated_at = now()
           WHERE id = $5`,
          chunk.title,
          chunk.content,
          vectorLiteral,
          chunk.contentHash,
          action.existingId,
        );
        summary.updated++;
      }
    }

    for (const row of rowsToDelete) {
      await tx.$executeRawUnsafe(
        `DELETE FROM knowledge_documents WHERE id = $1`,
        row.id,
      );
      summary.deleted++;
    }
  });

  return summary;
}

async function main(): Promise<void> {
  const apiKey = getOpenAIApiKey();
  const docsRoot = path.resolve(__dirname, "..", "..", "documentation");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const embedder = new OpenAIEmbeddings({
    apiKey,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMS,
  });

  const summary = await runIngestion({
    prisma,
    embedder: {
      embedDocuments: (texts) => embedder.embedDocuments(texts),
    },
    splitter: {
      splitText: (text) => splitter.splitText(text),
    },
    listMarkdownFiles: () => listMarkdownFiles(docsRoot),
    readFile: (filePath) => fs.readFile(filePath, "utf8"),
  });

  console.log(
    `[ingest:knowledge] files=${summary.files} inserted=${summary.inserted} updated=${summary.updated} skipped=${summary.skipped} deleted=${summary.deleted}`,
  );
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[ingest:knowledge] failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
