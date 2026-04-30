import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseMessage } from "@langchain/core/messages";
import type { z } from "zod";

import { CHAT_MODEL, getGoogleApiKey } from "./rag";

export interface ChatLLM {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
}

export interface StructuredLLM<T> {
  extract(messages: BaseMessage[]): Promise<T>;
}

export function getChatModel(): ChatLLM {
  const llm = new ChatGoogleGenerativeAI({
    apiKey: getGoogleApiKey(),
    model: CHAT_MODEL,
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
  const llm = new ChatGoogleGenerativeAI({
    apiKey: getGoogleApiKey(),
    model: CHAT_MODEL,
    temperature: 0,
    maxRetries: 2,
  });
  const structured = llm.withStructuredOutput(schema, { name });
  return {
    extract: (messages) => structured.invoke(messages) as Promise<T>,
  };
}
