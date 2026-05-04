import { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { z } from "zod";

import { CHAT_MODEL } from "./rag";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`[aiProvider] Missing required environment variable: ${name}`);
  }
  return value;
}

let OPENROUTER_KEY: string | null = null;

function getOpenRouterKey(): string {
  if (OPENROUTER_KEY) return OPENROUTER_KEY;
  OPENROUTER_KEY = requireEnv("OPENROUTER_API_KEY");
  const prefix = OPENROUTER_KEY.substring(0, 12);
  console.log(`[aiProvider] OPENROUTER_API_KEY prefix=${prefix} loaded=${!!OPENROUTER_KEY}`);
  return OPENROUTER_KEY;
}

export interface ChatLLM {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
}

export interface StructuredLLM<T> {
  extract(messages: BaseMessage[]): Promise<T>;
}

export function getChatModel(): ChatLLM {
  const apiKey = getOpenRouterKey();
  const llm = new ChatOpenAI({
    modelName: CHAT_MODEL,
    apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    },
    temperature: 0.2,
    maxRetries: 2,
  });
  return {
    invoke: (messages) => llm.invoke(messages) as Promise<{ content: unknown }>,
  };
}

export function getStructuredChatModel<T extends Record<string, unknown>>(
  schema: z.ZodType<T>,
  name: string,
): StructuredLLM<T> {
  const apiKey = getOpenRouterKey();
  const llm = new ChatOpenAI({
    modelName: CHAT_MODEL,
    apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    },
    temperature: 0,
    maxRetries: 2,
  });
  const structured = llm.withStructuredOutput(schema, { name });
  return {
    extract: (messages) => structured.invoke(messages) as Promise<T>,
  };
}
