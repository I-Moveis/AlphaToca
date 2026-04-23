import { OpenAIEmbeddings } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";

import prisma from "../config/db";
import {
  EMBEDDING_MODEL,
  RETRIEVER_K,
  getOpenAIApiKey,
} from "../config/rag";

export interface RetrievedChunk {
  id: string;
  content: string;
  title: string;
  score: number;
}

export interface QueryEmbedder {
  embedQuery(text: string): Promise<number[]>;
}

export type PrismaRetrieverClient = Pick<PrismaClient, "$queryRawUnsafe">;

export interface RetrieverDeps {
  prisma: PrismaRetrieverClient;
  embedder: QueryEmbedder;
  k?: number;
}

interface RetrievedRow {
  id: string;
  content: string;
  title: string;
  distance: number | string;
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

let defaultDepsCache: RetrieverDeps | null = null;

function getDefaultDeps(): RetrieverDeps {
  if (defaultDepsCache) return defaultDepsCache;
  const apiKey = getOpenAIApiKey();
  const embedder = new OpenAIEmbeddings({ apiKey, model: EMBEDDING_MODEL, timeout: 15000 });
  defaultDepsCache = {
    prisma,
    embedder: {
      embedQuery: (text) => embedder.embedQuery(text),
    },
  };
  return defaultDepsCache;
}

export async function retrieveRelevantChunks(
  query: string,
  overrideDeps?: RetrieverDeps,
): Promise<RetrievedChunk[]> {
  if (typeof query !== "string" || query.trim() === "") {
    return [];
  }

  const deps = overrideDeps ?? getDefaultDeps();
  const k = deps.k ?? RETRIEVER_K;

  const vector = await deps.embedder.embedQuery(query);
  const vectorLiteral = toVectorLiteral(vector);

  const rows = await deps.prisma.$queryRawUnsafe<RetrievedRow[]>(
    `SELECT id, content, title, (embedding <=> $1::vector) AS distance
       FROM knowledge_documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $2`,
    vectorLiteral,
    k,
  );

  return rows.map((row) => {
    const distance =
      typeof row.distance === "string" ? parseFloat(row.distance) : row.distance;
    const score = 1 - distance;
    return {
      id: row.id,
      content: row.content,
      title: row.title,
      score,
    };
  });
}
