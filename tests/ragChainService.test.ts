import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";

import {
  generateAnswer,
  formatContext,
  buildSystemPrompt,
  historyToMessages,
  LANDLORD_MESSAGE_PREFIX,
  type ChainDeps,
} from "../src/services/ragChainService";
import { SIMILARITY_THRESHOLD } from "../src/config/rag";

type FakeChunk = {
  id: string;
  content: string;
  title: string;
  score: number;
};

type FakeStoredMessage = {
  senderType: "BOT" | "TENANT" | "LANDLORD";
  content: string;
};

type LlmTurn = {
  content: unknown;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

function makeDeps(opts: {
  chunks: FakeChunk[];
  history?: FakeStoredMessage[];
  llmResponseContent?: unknown;
  llmTurns?: LlmTurn[];
  historyLimit?: number;
  similarityThreshold?: number;
  tools?: Record<string, (args: Record<string, unknown>) => Promise<string>>;
}) {
  const llmCalls: BaseMessage[][] = [];
  const retrieverCalls: string[] = [];
  const historyQueries: unknown[] = [];

  const history = opts.history ?? [];
  const turns = opts.llmTurns ? [...opts.llmTurns] : null;

  const deps: ChainDeps & {
    llmCalls: typeof llmCalls;
    retrieverCalls: typeof retrieverCalls;
    historyQueries: typeof historyQueries;
  } = {
    prisma: {
      message: {
        findMany: vi.fn(async (args: unknown) => {
          historyQueries.push(args);
          const orderArg = (args as { orderBy?: { timestamp?: "asc" | "desc" } })
            .orderBy?.timestamp;
          const take = (args as { take?: number }).take ?? history.length;
          const sliced =
            orderArg === "desc"
              ? history.slice().reverse().slice(0, take)
              : history.slice(0, take);
          return sliced;
        }),
      },
      // vitest mocks — cast to PrismaClient-compatible shape used by service
    } as unknown as ChainDeps["prisma"],
    retriever: {
      retrieve: vi.fn(async (query: string) => {
        retrieverCalls.push(query);
        return opts.chunks;
      }),
    },
    llm: {
      invoke: vi.fn(async (messages: BaseMessage[]) => {
        llmCalls.push(messages);
        if (turns && turns.length > 0) {
          return turns.shift() as LlmTurn;
        }
        return {
          content:
            opts.llmResponseContent !== undefined
              ? opts.llmResponseContent
              : "Uma resposta fundamentada em português.",
        };
      }),
    },
    tools: opts.tools,
    historyLimit: opts.historyLimit,
    similarityThreshold: opts.similarityThreshold,
    llmCalls,
    retrieverCalls,
    historyQueries,
  };

  return deps;
}

describe("formatContext", () => {
  it("returns empty string for zero chunks", () => {
    expect(formatContext([])).toBe("");
  });

  it("formats chunks with titles and scores", () => {
    const out = formatContext([
      { id: "a", title: "Triagem", content: "Fluxo de triagem", score: 0.9 },
      { id: "b", title: "Visita", content: "Como agendar", score: 0.8 },
    ]);
    expect(out).toContain("Triagem");
    expect(out).toContain("Fluxo de triagem");
    expect(out).toContain("Visita");
    expect(out).toContain("0.900");
    expect(out).toContain("0.800");
  });
});

describe("buildSystemPrompt", () => {
  it("inlines context into the prompt", () => {
    const prompt = buildSystemPrompt("SOME CONTEXT");
    expect(prompt).toContain("SOME CONTEXT");
    expect(prompt).toContain("AlphaToca");
    expect(prompt).toContain("português");
  });

  it("falls back to a placeholder when context is blank", () => {
    const prompt = buildSystemPrompt("");
    expect(prompt).toContain("sem contexto disponível");
  });
});

describe("historyToMessages", () => {
  it("maps BOT -> AIMessage and TENANT -> HumanMessage (plain)", () => {
    const out = historyToMessages([
      { senderType: "TENANT", content: "oi" },
      { senderType: "BOT", content: "olá!" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeInstanceOf(HumanMessage);
    expect((out[0] as HumanMessage).content).toBe("oi");
    expect(out[1]).toBeInstanceOf(AIMessage);
    expect((out[1] as AIMessage).content).toBe("olá!");
  });

  it("prefixes LANDLORD messages so the LLM can tell them apart from the current tenant", () => {
    const out = historyToMessages([
      { senderType: "LANDLORD", content: "esse imóvel não está mais disponível" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(HumanMessage);
    const content = (out[0] as HumanMessage).content as string;
    expect(content.startsWith(LANDLORD_MESSAGE_PREFIX)).toBe(true);
    expect(content).toContain("esse imóvel não está mais disponível");
  });

  it("keeps TENANT content verbatim (no prefix leak)", () => {
    const out = historyToMessages([
      { senderType: "TENANT", content: "quero alugar um apê" },
    ]);
    expect((out[0] as HumanMessage).content).toBe("quero alugar um apê");
  });
});

describe("generateAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the handoff fallback when no chunks are retrieved", async () => {
    const deps = makeDeps({ chunks: [] });
    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "pergunta qualquer" },
      deps,
    );

    expect(result.handoff).toBe(true);
    expect(result.topScore).toBe(0);
    expect(result.usedChunkIds).toEqual([]);
    expect(result.answer).toMatch(/atendentes? humano/);
    expect(deps.llm.invoke).not.toHaveBeenCalled();
  });

  it("returns the handoff fallback when top score is below threshold", async () => {
    const lowScore = SIMILARITY_THRESHOLD - 0.1;
    const deps = makeDeps({
      chunks: [
        { id: "c1", title: "X", content: "algo", score: lowScore },
        { id: "c2", title: "Y", content: "outra coisa", score: lowScore - 0.1 },
      ],
    });
    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "pergunta" },
      deps,
    );

    expect(result.handoff).toBe(true);
    expect(result.topScore).toBeCloseTo(lowScore, 10);
    expect(result.usedChunkIds).toEqual(["c1", "c2"]);
    expect(deps.llm.invoke).not.toHaveBeenCalled();
  });

  it("calls the LLM and returns the answer when top score is above threshold", async () => {
    const highScore = SIMILARITY_THRESHOLD + 0.1;
    const deps = makeDeps({
      chunks: [
        { id: "c1", title: "Visita", content: "Como agendar visita", score: highScore },
      ],
      llmResponseContent: "Para agendar uma visita, acesse o app...",
    });

    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "como agendo visita?" },
      deps,
    );

    expect(result.handoff).toBe(false);
    expect(result.topScore).toBeCloseTo(highScore, 10);
    expect(result.usedChunkIds).toEqual(["c1"]);
    expect(result.answer).toBe("Para agendar uma visita, acesse o app...");
    expect(deps.llm.invoke).toHaveBeenCalledTimes(1);
  });

  it("includes the chat history in the prompt, ordered oldest-first", async () => {
    const highScore = SIMILARITY_THRESHOLD + 0.05;
    const deps = makeDeps({
      chunks: [
        { id: "c1", title: "T", content: "body", score: highScore },
      ],
      history: [
        { senderType: "TENANT", content: "oi, preciso de ajuda" },
        { senderType: "BOT", content: "claro, em que posso ajudar?" },
        { senderType: "TENANT", content: "quero alugar" },
      ],
    });

    await generateAnswer(
      { sessionId: "s1", userMessage: "o que preciso para alugar?" },
      deps,
    );

    const prompt = deps.llmCalls[0];
    // System + 3 history + new user = 5
    expect(prompt).toHaveLength(5);
    expect(prompt[0]).toBeInstanceOf(SystemMessage);
    expect(prompt[1]).toBeInstanceOf(HumanMessage);
    expect((prompt[1] as HumanMessage).content).toBe("oi, preciso de ajuda");
    expect(prompt[2]).toBeInstanceOf(AIMessage);
    expect((prompt[2] as AIMessage).content).toBe("claro, em que posso ajudar?");
    expect(prompt[3]).toBeInstanceOf(HumanMessage);
    expect((prompt[3] as HumanMessage).content).toBe("quero alugar");
    expect(prompt[4]).toBeInstanceOf(HumanMessage);
    expect((prompt[4] as HumanMessage).content).toBe(
      "o que preciso para alugar?",
    );
  });

  it("loads at most historyLimit messages (last N) in ASC order", async () => {
    const highScore = SIMILARITY_THRESHOLD + 0.05;
    const allHistory: FakeStoredMessage[] = Array.from({ length: 20 }, (_, i) => ({
      senderType: i % 2 === 0 ? "TENANT" : "BOT",
      content: `msg-${i}`,
    }));
    const deps = makeDeps({
      chunks: [{ id: "c1", title: "T", content: "b", score: highScore }],
      history: allHistory,
      historyLimit: 10,
    });

    await generateAnswer(
      { sessionId: "s1", userMessage: "pergunta nova" },
      deps,
    );

    expect(deps.prisma.message.findMany).toHaveBeenCalledTimes(1);
    const call = (deps.prisma.message.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where.sessionId).toBe("s1");
    expect(call.take).toBe(10);
    expect(call.orderBy.timestamp).toBe("desc");
  });

  it("injects the retrieved context into the system prompt", async () => {
    const highScore = SIMILARITY_THRESHOLD + 0.2;
    const deps = makeDeps({
      chunks: [
        {
          id: "c1",
          title: "Documentação",
          content: "CPF e comprovante de renda são obrigatórios.",
          score: highScore,
        },
      ],
    });

    await generateAnswer(
      { sessionId: "s1", userMessage: "que documentos preciso?" },
      deps,
    );

    const prompt = deps.llmCalls[0];
    const sys = prompt[0] as SystemMessage;
    expect(typeof sys.content === "string").toBe(true);
    expect(sys.content as string).toContain("CPF e comprovante de renda");
    expect(sys.content as string).toContain("Documentação");
  });

  it("extracts text from array-shaped LLM content blocks", async () => {
    const highScore = SIMILARITY_THRESHOLD + 0.1;
    const deps = makeDeps({
      chunks: [{ id: "c1", title: "T", content: "b", score: highScore }],
      llmResponseContent: [
        { type: "text", text: "Parte 1. " },
        { type: "text", text: "Parte 2." },
      ],
    });

    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "teste" },
      deps,
    );
    expect(result.answer).toBe("Parte 1. Parte 2.");
  });

  it("allows a per-call similarityThreshold override via deps", async () => {
    const deps = makeDeps({
      chunks: [{ id: "c1", title: "T", content: "b", score: 0.5 }],
      similarityThreshold: 0.4,
    });

    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "pergunta" },
      deps,
    );
    expect(result.handoff).toBe(false);
    expect(deps.llm.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("generateAnswer with tool calling", () => {
  it("executes requested tool and loops back to the LLM, returning final text", async () => {
    const checkAvailability = vi.fn(async () => JSON.stringify([
      { startsAt: "2026-05-10T14:00:00Z", endsAt: "2026-05-10T14:45:00Z" },
    ]));

    const deps = makeDeps({
      chunks: [{ id: "c1", title: "Agendamento", content: "regras", score: 0.8 }],
      llmTurns: [
        // Turno 1: LLM pede a tool
        {
          content: "",
          tool_calls: [
            {
              id: "call-1",
              name: "check_availability",
              args: {
                propertyId: "11111111-1111-1111-1111-111111111111",
                from: "2026-05-10T13:00:00Z",
                to: "2026-05-10T16:00:00Z",
              },
            },
          ],
        },
        // Turno 2: LLM responde texto final
        { content: "Tenho um horário livre às 14h de sexta. Confirma?" },
      ],
      tools: { check_availability: checkAvailability },
    });

    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "quero visitar o imóvel X" },
      deps,
    );

    expect(checkAvailability).toHaveBeenCalledTimes(1);
    expect(checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "11111111-1111-1111-1111-111111111111",
      }),
    );
    expect(deps.llm.invoke).toHaveBeenCalledTimes(2);
    expect(result.answer).toBe("Tenho um horário livre às 14h de sexta. Confirma?");
    expect(result.handoff).toBe(false);
  });

  it("stops after maxIterations=3 even if LLM keeps requesting tools", async () => {
    const checkAvailability = vi.fn(async () => "[]");

    const deps = makeDeps({
      chunks: [{ id: "c1", title: "T", content: "b", score: 0.8 }],
      llmTurns: [
        { content: "", tool_calls: [{ id: "c1", name: "check_availability", args: {} }] },
        { content: "", tool_calls: [{ id: "c2", name: "check_availability", args: {} }] },
        { content: "", tool_calls: [{ id: "c3", name: "check_availability", args: {} }] },
        { content: "", tool_calls: [{ id: "c4", name: "check_availability", args: {} }] },
        { content: "giving up" },
      ],
      tools: { check_availability: checkAvailability },
    });

    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "loop" },
      deps,
    );

    // Expect limit: 3 tool-executing turns, so at most 4 LLM calls (initial + 3 loops)
    expect(deps.llm.invoke.mock.calls.length).toBeLessThanOrEqual(4);
    expect(checkAvailability.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.answer).toBeDefined();
  });

  it("returns fallback-like error text if a requested tool is missing from deps", async () => {
    const deps = makeDeps({
      chunks: [{ id: "c1", title: "T", content: "b", score: 0.8 }],
      llmTurns: [
        {
          content: "",
          tool_calls: [
            { id: "call-1", name: "nonexistent_tool", args: {} },
          ],
        },
        { content: "ok, entendi" },
      ],
      tools: {},
    });

    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "loop" },
      deps,
    );
    // Mesmo com tool ausente, segue o loop (ToolMessage com erro) e chega ao final
    expect(result.answer).toBe("ok, entendi");
  });

  it("when LLM response has no tool_calls, runs exactly once (backwards compatible)", async () => {
    const deps = makeDeps({
      chunks: [{ id: "c1", title: "T", content: "b", score: 0.8 }],
    });
    const result = await generateAnswer(
      { sessionId: "s1", userMessage: "oi" },
      deps,
    );
    expect(deps.llm.invoke).toHaveBeenCalledTimes(1);
    expect(result.answer).toBe("Uma resposta fundamentada em português.");
  });
});
