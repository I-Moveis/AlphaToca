import { GoogleGenAI } from "@google/genai";

import {
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  getGoogleApiKey,
  l2Normalize,
} from "./rag";

/**
 * Adapter mínimo sobre o SDK oficial `@google/genai` que expõe os métodos
 * `embedQuery` e `embedDocuments` no mesmo formato consumido pelo projeto.
 *
 * O wrapper `GoogleGenerativeAIEmbeddings` do `@langchain/google-genai` usa
 * internamente o SDK legado `@google/generative-ai`, que NÃO suporta o
 * parâmetro `outputDimensionality`. Como Gemini `embedding-001` retorna
 * vetores de 3072 dims por padrão e a equipe decidiu usar 1536 dims,
 * precisamos falar direto com o SDK novo.
 *
 * Observação: para dims < 3072, Gemini NÃO pré-normaliza o vetor — é
 * obrigatório normalizar via L2 antes de indexar/consultar para que a
 * distância cosseno no pgvector produza scores comparáveis.
 */
export interface GeminiEmbedderAdapter {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export function createGeminiEmbedder(): GeminiEmbedderAdapter {
  const apiKey = getGoogleApiKey();
  const client = new GoogleGenAI({ apiKey });

  async function embedOne(text: string): Promise<number[]> {
    const res = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMS,
      },
    });
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error(
        `[geminiEmbedder] empty embedding for input (model=${EMBEDDING_MODEL}, dims=${EMBEDDING_DIMS})`,
      );
    }
    if (values.length !== EMBEDDING_DIMS) {
      throw new Error(
        `[geminiEmbedder] expected ${EMBEDDING_DIMS} dims, got ${values.length}`,
      );
    }
    return l2Normalize(values);
  }

  async function embedBatch(texts: string[]): Promise<number[][]> {
    // `embedContent` do SDK novo aceita `contents: string[]`, mas na prática
    // alguns modelos (incluindo `gemini-embedding-001`) rejeitam arrays e
    // exigem 1 chamada por input. Para manter o comportamento consistente em
    // qualquer tamanho de base de conhecimento, serializamos.
    const out: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i++) {
      out[i] = await embedOne(texts[i]);
    }
    return out;
  }

  return {
    embedQuery: embedOne,
    embedDocuments: embedBatch,
  };
}
