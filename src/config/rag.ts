export const EMBEDDING_MODEL = "text-embedding-3-small" as const;
// 512 dims retém ~98% da qualidade de recuperação de 1536 dims
// (ver https://openai.com/research/matryoshka), com 1/3 do armazenamento
// e queries mais rápidas. Alterar este valor exige migration + re-ingestão.
export const EMBEDDING_DIMS = 512 as const;
export const CHUNK_SIZE = 800 as const;
export const CHUNK_OVERLAP = 120 as const;
export const RETRIEVER_K = 4 as const;
export const SIMILARITY_THRESHOLD = 0.78 as const;

export type RagConfig = {
  EMBEDDING_MODEL: typeof EMBEDDING_MODEL;
  EMBEDDING_DIMS: typeof EMBEDDING_DIMS;
  CHUNK_SIZE: typeof CHUNK_SIZE;
  CHUNK_OVERLAP: typeof CHUNK_OVERLAP;
  RETRIEVER_K: typeof RETRIEVER_K;
  SIMILARITY_THRESHOLD: typeof SIMILARITY_THRESHOLD;
};

function requireEnv(name: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY"): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `[rag-config] Missing required environment variable: ${name}. ` +
        `Set it in your .env (loaded via dotenv) before starting the worker or running the ingestion/eval scripts.`,
    );
  }
  return value;
}

export function getOpenAIApiKey(): string {
  return requireEnv("OPENAI_API_KEY");
}

export function getAnthropicApiKey(): string {
  return requireEnv("ANTHROPIC_API_KEY");
}

export function assertRagSecrets(): void {
  getOpenAIApiKey();
  getAnthropicApiKey();
}
