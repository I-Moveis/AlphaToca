import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { PrismaClient } from "@prisma/client";

import prisma from "../config/db";
import { CHAT_MODEL, SIMILARITY_THRESHOLD, getGoogleApiKey } from "../config/rag";
import {
  retrieveRelevantChunks,
  type RetrievedChunk,
} from "./ragRetrieverService";

export interface GenerateAnswerInput {
  sessionId: string;
  userMessage: string;
}

export interface GenerateAnswerResult {
  answer: string;
  handoff: boolean;
  topScore: number;
  usedChunkIds: string[];
}

export interface ChatLLM {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
}

export interface Retriever {
  retrieve(query: string): Promise<RetrievedChunk[]>;
}

export type PrismaChainClient = Pick<PrismaClient, "message">;

export interface ChainDeps {
  prisma: PrismaChainClient;
  retriever: Retriever;
  llm: ChatLLM;
  historyLimit?: number;
  similarityThreshold?: number;
}

const DEFAULT_HISTORY_LIMIT = 10;
const FALLBACK_ANSWER =
  "Obrigado pela sua mensagem! Para te dar a resposta mais precisa, vou transferir essa conversa para um dos nossos atendentes humanos. Em instantes alguém do nosso time falará com você por aqui.";

const SYSTEM_PROMPT = [
  "Você é o assistente virtual do AlphaToca, uma plataforma de aluguel de imóveis no Brasil.",
  "",
  "Diretrizes de comunicação (obrigatórias):",
  "- Tom de voz profissional, acolhedor, objetivo e, acima de tudo, confiável. O objetivo primário de cada interação é transmitir segurança.",
  "- Baseie suas respostas UNICAMENTE nas informações do contexto fornecido abaixo e nas regras de negócio do AlphaToca. Nunca invente dados, preços, prazos ou políticas.",
  "- Responda sempre em português do Brasil.",
  "- Em caso de negociações sensíveis, litígios ou exceções à regra, informe ao usuário que você vai encaminhar para um atendente humano.",
  "- Seja breve e direto: respostas curtas funcionam melhor no WhatsApp.",
  "- Se o contexto não cobrir a pergunta, diga isso com honestidade e ofereça o encaminhamento para um humano.",
  "",
  "Papéis no histórico da conversa:",
  "- Mensagens prefixadas com \"[Proprietário]\" vêm do locador do imóvel, não do inquilino. Trate-as como correções supervisórias (ex.: disponibilidade do imóvel, preço atualizado), não como perguntas do cliente atual. Se houver conflito entre uma resposta anterior sua e uma mensagem [Proprietário], priorize a informação do [Proprietário].",
  "- Mensagens sem prefixo vêm do inquilino atual — são as que você está respondendo.",
  "",
  "Contexto recuperado da base de conhecimento (use apenas isto para responder):",
  "{context}",
].join("\n");

export function buildSystemPrompt(context: string): string {
  return SYSTEM_PROMPT.replace("{context}", context.trim() || "(sem contexto disponível)");
}

export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((chunk, i) => {
      const header = `[#${i + 1} — ${chunk.title} (score=${chunk.score.toFixed(3)})]`;
      return `${header}\n${chunk.content.trim()}`;
    })
    .join("\n\n---\n\n");
}

interface StoredMessage {
  senderType: "BOT" | "TENANT" | "LANDLORD";
  content: string;
}

export const LANDLORD_MESSAGE_PREFIX = "[Proprietário]";

export function historyToMessages(history: StoredMessage[]): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of history) {
    if (m.senderType === "BOT") {
      out.push(new AIMessage(m.content));
    } else if (m.senderType === "LANDLORD") {
      out.push(new HumanMessage(`${LANDLORD_MESSAGE_PREFIX} ${m.content}`));
    } else {
      out.push(new HumanMessage(m.content));
    }
  }
  return out;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        parts.push(block);
      } else if (block && typeof block === "object" && "text" in block) {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") parts.push(text);
      }
    }
    return parts.join("").trim();
  }
  return "";
}

let defaultDepsCache: ChainDeps | null = null;

function getDefaultDeps(): ChainDeps {
  if (defaultDepsCache) return defaultDepsCache;
  const apiKey = getGoogleApiKey();
  const llm = new ChatGoogleGenerativeAI({
    apiKey,
    model: CHAT_MODEL,
    temperature: 0.2,
    maxRetries: 2,
  });
  defaultDepsCache = {
    prisma,
    retriever: {
      retrieve: (query) => retrieveRelevantChunks(query),
    },
    llm: {
      invoke: (messages) => llm.invoke(messages) as Promise<{ content: unknown }>,
    },
  };
  return defaultDepsCache;
}

export async function generateAnswer(
  input: GenerateAnswerInput,
  overrideDeps?: ChainDeps,
): Promise<GenerateAnswerResult> {
  const { sessionId, userMessage } = input;
  const deps = overrideDeps ?? getDefaultDeps();
  const historyLimit = deps.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const threshold = deps.similarityThreshold ?? SIMILARITY_THRESHOLD;

  const chunks = await deps.retriever.retrieve(userMessage);
  const topScore = chunks.length > 0 ? chunks[0].score : 0;
  const usedChunkIds = chunks.map((c) => c.id);

  if (chunks.length === 0 || topScore < threshold) {
    return {
      answer: FALLBACK_ANSWER,
      handoff: true,
      topScore,
      usedChunkIds,
    };
  }

  const recent = (await deps.prisma.message.findMany({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
    take: historyLimit,
    select: { senderType: true, content: true },
  })) as StoredMessage[];
  const stored = recent.slice().reverse();

  const systemPrompt = buildSystemPrompt(formatContext(chunks));
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...historyToMessages(stored),
    new HumanMessage(userMessage),
  ];

  const response = await deps.llm.invoke(messages);
  const answer = extractTextContent(response.content) || FALLBACK_ANSWER;

  return {
    answer,
    handoff: false,
    topScore,
    usedChunkIds,
  };
}
