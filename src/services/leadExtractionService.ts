import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import prisma from "../config/db";
import { CHAT_MODEL, getGoogleApiKey } from "../config/rag";

export const INTENT_VALUES = [
  "search",
  "schedule_visit",
  "contract_question",
  "human_handoff",
  "other",
] as const;
export type Intent = (typeof INTENT_VALUES)[number];

export const InsightsSchema = z.object({
  budget: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  bedrooms: z.number().int().optional().nullable(),
  pets_allowed: z.boolean().optional().nullable(),
  // Texto livre citado pelo usuário: "amanhã às 10h", "sábado de manhã", etc.
  // Fica como string para a Fase C (tool calling) interpretar com a ajuda da LLM.
  preferred_visit_date: z.string().optional().nullable(),
  // Título ou identificador mencionado pelo usuário — usado pra casar com Property.
  property_mentioned: z.string().optional().nullable(),
  intent: z.enum(INTENT_VALUES),
});

export type ExtractedInsights = z.infer<typeof InsightsSchema>;

export interface ExtractInsightsInput {
  sessionId: string;
  userMessage: string;
}

export interface ExtractInsightsResult {
  insights: ExtractedInsights;
  rentalProcessId: string;
  upsertedKeys: string[];
  handoff: boolean;
}

export interface StructuredLLM {
  extract(messages: BaseMessage[]): Promise<ExtractedInsights>;
}

export type PrismaExtractionClient = Pick<
  PrismaClient,
  "chatSession" | "rentalProcess" | "aiExtractedInsight" | "visit"
>;

export interface ExtractionDeps {
  prisma: PrismaExtractionClient;
  llm: StructuredLLM;
}

const SYSTEM_PROMPT = [
  "Você é um extrator estruturado de informações do AlphaToca (aluguel de imóveis no Brasil).",
  "",
  "Sua função é ler a mensagem do inquilino e extrair, quando presentes, as seguintes informações:",
  "- budget: orçamento mensal mencionado (ex: 'R$ 2.000', 'até 2500'). Mantenha o texto como apareceu.",
  "- neighborhood: bairro ou região desejada (ex: 'Pinheiros', 'zona sul').",
  "- bedrooms: número de quartos desejado (inteiro).",
  "- pets_allowed: true se o usuário mencionou que precisa aceitar pets; false se mencionou que NÃO tem pets; null caso não mencione.",
  "- preferred_visit_date: texto de data/horário citado para visita (ex: 'amanhã às 10h', 'sábado de manhã'). Copie como o usuário escreveu.",
  "- property_mentioned: nome/título/identificador de imóvel citado pelo usuário (ex: 'Apartamento no Jardim das Flores'). Copie o trecho.",
  "- intent: uma das opções abaixo, escolhida pela intenção predominante da mensagem:",
  "  * \"search\" — está procurando imóveis para alugar.",
  "  * \"schedule_visit\" — quer agendar uma visita OU está confirmando/remarcando uma visita.",
  "  * \"contract_question\" — dúvida sobre contrato, documentação ou políticas.",
  "  * \"human_handoff\" — pede para falar com um humano, reclama, ou a mensagem envolve litígio/exceção.",
  "  * \"other\" — qualquer outra coisa (saudação, agradecimento, etc).",
  "",
  "Regras importantes:",
  "- NÃO invente dados. Se uma informação não está na mensagem, retorne null ou omita o campo (exceto intent, que é sempre obrigatório).",
  "- intent sempre deve ser uma das cinco strings acima.",
  "- Responda APENAS no formato estruturado solicitado.",
].join("\n");

export function buildExtractionMessages(userMessage: string): BaseMessage[] {
  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userMessage)];
}

export function serializeInsightValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

const INSIGHT_KEYS: ReadonlyArray<keyof ExtractedInsights> = [
  "budget",
  "neighborhood",
  "bedrooms",
  "pets_allowed",
  "preferred_visit_date",
  "property_mentioned",
  "intent",
];

let defaultDepsCache: ExtractionDeps | null = null;

function getDefaultDeps(): ExtractionDeps {
  if (defaultDepsCache) return defaultDepsCache;
  const apiKey = getGoogleApiKey();
  const base = new ChatGoogleGenerativeAI({
    apiKey,
    model: CHAT_MODEL,
    temperature: 0,
    maxRetries: 2,
  });
  const structured = base.withStructuredOutput(InsightsSchema, {
    name: "extract_lead_insights",
  });
  defaultDepsCache = {
    prisma,
    llm: {
      extract: (messages) =>
        structured.invoke(messages) as Promise<ExtractedInsights>,
    },
  };
  return defaultDepsCache;
}

export async function extractInsights(
  input: ExtractInsightsInput,
  overrideDeps?: ExtractionDeps,
): Promise<ExtractInsightsResult> {
  const { sessionId, userMessage } = input;
  const deps = overrideDeps ?? getDefaultDeps();

  const session = await deps.prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!session) {
    throw new Error(
      `[leadExtraction] ChatSession ${sessionId} not found; cannot extract insights.`,
    );
  }

  const messages = buildExtractionMessages(userMessage);
  const parsed = await deps.llm.extract(messages);
  const insights = InsightsSchema.parse(parsed);

  let rentalProcess = await deps.prisma.rentalProcess.findFirst({
    where: {
      tenantId: session.tenantId,
      status: { not: "CLOSED" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (!rentalProcess) {
    rentalProcess = await deps.prisma.rentalProcess.create({
      data: { tenantId: session.tenantId, status: "TRIAGE" },
      select: { id: true, status: true },
    });
  }
  const rentalProcessId = rentalProcess.id;
  const rentalProcessFull = rentalProcess;

  const upsertedKeys: string[] = [];
  for (const key of INSIGHT_KEYS) {
    const value = insights[key];
    if (value === undefined || value === null) continue;

    const insightValue = serializeInsightValue(value);
    const existing = await deps.prisma.aiExtractedInsight.findFirst({
      where: { rentalProcessId, insightKey: key },
      select: { id: true, insightValue: true },
    });
    if (existing) {
      if (existing.insightValue !== insightValue) {
        await deps.prisma.aiExtractedInsight.update({
          where: { id: existing.id },
          data: { insightValue },
        });
      }
    } else {
      await deps.prisma.aiExtractedInsight.create({
        data: { rentalProcessId, insightKey: key, insightValue },
      });
    }
    upsertedKeys.push(key);
  }

  let handoff = false;
  if (insights.intent === "human_handoff" && session.status !== "WAITING_HUMAN") {
    await deps.prisma.chatSession.update({
      where: { id: sessionId },
      data: { status: "WAITING_HUMAN" },
    });
    handoff = true;
  }

  // Transição TRIAGE → VISIT_SCHEDULED quando a intenção atual é de agendar
  // E já existe uma Visit SCHEDULED no processo (criada pela Fase C via tool
  // calling). Evita flag se o processo já mudou para VISIT_SCHEDULED ou adiante.
  if (insights.intent === "schedule_visit" && rentalProcessFull.status === "TRIAGE") {
    const scheduledVisit = await deps.prisma.visit.findFirst({
      where: { rentalProcessId, status: "SCHEDULED" },
      select: { id: true },
    });
    if (scheduledVisit) {
      await deps.prisma.rentalProcess.update({
        where: { id: rentalProcessId },
        data: { status: "VISIT_SCHEDULED" },
      });
    }
  }

  return {
    insights,
    rentalProcessId,
    upsertedKeys,
    handoff,
  };
}
