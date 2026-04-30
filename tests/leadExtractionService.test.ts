import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";

import {
  extractInsights,
  buildExtractionMessages,
  serializeInsightValue,
  InsightsSchema,
  type ExtractedInsights,
  type ExtractionDeps,
} from "../src/services/leadExtractionService";

type FakeSession = {
  id: string;
  tenantId: string;
  status: "ACTIVE_BOT" | "WAITING_HUMAN" | "RESOLVED";
};

type FakeProcess = {
  id: string;
  tenantId: string;
  status: "TRIAGE" | "VISIT_SCHEDULED" | "CONTRACT_ANALYSIS" | "CLOSED";
};

type FakeInsightRow = {
  id: string;
  rentalProcessId: string;
  insightKey: string;
  insightValue: string;
};

interface DepsHarness {
  deps: ExtractionDeps;
  mocks: {
    sessionFindUnique: ReturnType<typeof vi.fn>;
    sessionUpdate: ReturnType<typeof vi.fn>;
    processFindFirst: ReturnType<typeof vi.fn>;
    processCreate: ReturnType<typeof vi.fn>;
    insightFindFirst: ReturnType<typeof vi.fn>;
    insightCreate: ReturnType<typeof vi.fn>;
    insightUpdate: ReturnType<typeof vi.fn>;
    llmExtract: ReturnType<typeof vi.fn>;
  };
  state: {
    processes: FakeProcess[];
    insights: FakeInsightRow[];
  };
  lastExtractInput: BaseMessage[] | null;
}

function makeDeps(opts: {
  session?: FakeSession | null;
  insightsOut: ExtractedInsights;
  initialProcess?: FakeProcess | null;
  initialInsights?: FakeInsightRow[];
}): DepsHarness {
  const sessionRow = opts.session ?? {
    id: "session-1",
    tenantId: "tenant-1",
    status: "ACTIVE_BOT" as const,
  };
  const processes: FakeProcess[] = opts.initialProcess ? [opts.initialProcess] : [];
  const insights: FakeInsightRow[] = opts.initialInsights
    ? opts.initialInsights.map((i) => ({ ...i }))
    : [];

  const sessionFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    if (!sessionRow || sessionRow.id !== where.id) return null;
    return sessionRow;
  });

  const sessionUpdate = vi.fn(async ({ data }: { data: { status: FakeSession["status"] } }) => {
    if (sessionRow) sessionRow.status = data.status;
    return sessionRow;
  });

  const processFindFirst = vi.fn(
    async ({
      where,
    }: {
      where: { tenantId: string; status?: { not?: string } };
    }) => {
      const open = processes.filter(
        (p) => p.tenantId === where.tenantId && p.status !== "CLOSED",
      );
      if (open.length === 0) return null;
      return open[open.length - 1];
    },
  );

  const processCreate = vi.fn(
    async ({
      data,
    }: {
      data: { tenantId: string; status: FakeProcess["status"] };
    }) => {
      const row: FakeProcess = {
        id: `rp-${processes.length + 1}`,
        tenantId: data.tenantId,
        status: data.status,
      };
      processes.push(row);
      return { id: row.id };
    },
  );

  const insightFindFirst = vi.fn(
    async ({
      where,
    }: {
      where: { rentalProcessId: string; insightKey: string };
    }) =>
      insights.find(
        (i) =>
          i.rentalProcessId === where.rentalProcessId &&
          i.insightKey === where.insightKey,
      ) ?? null,
  );

  const insightCreate = vi.fn(
    async ({
      data,
    }: {
      data: {
        rentalProcessId: string;
        insightKey: string;
        insightValue: string;
      };
    }) => {
      const row: FakeInsightRow = {
        id: `ins-${insights.length + 1}`,
        ...data,
      };
      insights.push(row);
      return row;
    },
  );

  const insightUpdate = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { insightValue: string };
    }) => {
      const row = insights.find((i) => i.id === where.id);
      if (row) row.insightValue = data.insightValue;
      return row ?? null;
    },
  );

  const llmExtract = vi.fn(async () => opts.insightsOut);

  const harness: DepsHarness = {
    deps: {
      prisma: {
        chatSession: {
          findUnique: sessionFindUnique,
          update: sessionUpdate,
        },
        rentalProcess: {
          findFirst: processFindFirst,
          create: processCreate,
        },
        aiExtractedInsight: {
          findFirst: insightFindFirst,
          create: insightCreate,
          update: insightUpdate,
        },
      } as unknown as ExtractionDeps["prisma"],
      llm: {
        extract: async (messages) => {
          harness.lastExtractInput = messages;
          return llmExtract(messages);
        },
      },
    },
    mocks: {
      sessionFindUnique,
      sessionUpdate,
      processFindFirst,
      processCreate,
      insightFindFirst,
      insightCreate,
      insightUpdate,
      llmExtract,
    },
    state: { processes, insights },
    lastExtractInput: null,
  };

  return harness;
}

describe("InsightsSchema", () => {
  it("accepts a minimal payload with only intent", () => {
    const parsed = InsightsSchema.parse({ intent: "other" });
    expect(parsed.intent).toBe("other");
  });

  it("accepts a full payload", () => {
    const parsed = InsightsSchema.parse({
      budget: "R$ 2.000",
      neighborhood: "Pinheiros",
      bedrooms: 2,
      pets_allowed: true,
      intent: "search",
    });
    expect(parsed.bedrooms).toBe(2);
    expect(parsed.pets_allowed).toBe(true);
  });

  it("rejects an unknown intent", () => {
    expect(() =>
      InsightsSchema.parse({ intent: "buy_house" }),
    ).toThrow();
  });
});

describe("buildExtractionMessages", () => {
  it("returns a system + human message pair", () => {
    const msgs = buildExtractionMessages("quero alugar em Pinheiros");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toBeInstanceOf(SystemMessage);
    expect(msgs[1]).toBeInstanceOf(HumanMessage);
    const sys = msgs[0] as SystemMessage;
    expect(typeof sys.content === "string").toBe(true);
    expect(sys.content as string).toContain("I-Moveis");
    expect(sys.content as string).toContain("intent");
  });
});

describe("serializeInsightValue", () => {
  it("stringifies primitives", () => {
    expect(serializeInsightValue("foo")).toBe("foo");
    expect(serializeInsightValue(2)).toBe("2");
    expect(serializeInsightValue(true)).toBe("true");
    expect(serializeInsightValue(false)).toBe("false");
  });
});

describe("extractInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when the session does not exist", async () => {
    const harness = makeDeps({
      session: null,
      insightsOut: { intent: "other" },
    });
    await expect(
      extractInsights(
        { sessionId: "missing", userMessage: "oi" },
        harness.deps,
      ),
    ).rejects.toThrow(/ChatSession missing/);
    expect(harness.mocks.llmExtract).not.toHaveBeenCalled();
  });

  it("creates a new TRIAGE rental process when tenant has none open", async () => {
    const harness = makeDeps({
      insightsOut: {
        budget: "R$ 2.500",
        neighborhood: "Pinheiros",
        bedrooms: 2,
        pets_allowed: true,
        intent: "search",
      },
    });

    const result = await extractInsights(
      { sessionId: "session-1", userMessage: "quero alugar em Pinheiros até 2500" },
      harness.deps,
    );

    expect(harness.mocks.processCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", status: "TRIAGE" },
      select: { id: true },
    });
    expect(result.rentalProcessId).toBe("rp-1");
    expect(result.handoff).toBe(false);
    expect(result.upsertedKeys).toEqual([
      "budget",
      "neighborhood",
      "bedrooms",
      "pets_allowed",
      "intent",
    ]);
    expect(harness.mocks.insightCreate).toHaveBeenCalledTimes(5);
    // Values serialized as strings
    const createdValues = harness.state.insights.map(
      (r) => [r.insightKey, r.insightValue] as const,
    );
    expect(createdValues).toEqual(
      expect.arrayContaining([
        ["budget", "R$ 2.500"],
        ["neighborhood", "Pinheiros"],
        ["bedrooms", "2"],
        ["pets_allowed", "true"],
        ["intent", "search"],
      ]),
    );
  });

  it("reuses an existing non-CLOSED rental process and does NOT create a second one", async () => {
    const harness = makeDeps({
      insightsOut: { intent: "other" },
      initialProcess: {
        id: "rp-existing",
        tenantId: "tenant-1",
        status: "TRIAGE",
      },
    });

    const result = await extractInsights(
      { sessionId: "session-1", userMessage: "ok" },
      harness.deps,
    );

    expect(harness.mocks.processCreate).not.toHaveBeenCalled();
    expect(result.rentalProcessId).toBe("rp-existing");
  });

  it("skips null/undefined fields and only upserts present ones", async () => {
    const harness = makeDeps({
      insightsOut: {
        budget: null,
        neighborhood: "Moema",
        bedrooms: undefined as unknown as number | null,
        pets_allowed: null,
        intent: "search",
      },
    });

    const result = await extractInsights(
      { sessionId: "session-1", userMessage: "moema, procurando" },
      harness.deps,
    );
    expect(result.upsertedKeys.sort()).toEqual(["intent", "neighborhood"]);
    expect(harness.state.insights.map((r) => r.insightKey).sort()).toEqual([
      "intent",
      "neighborhood",
    ]);
  });

  it("updates an existing insight row rather than inserting a duplicate when called twice", async () => {
    const harness = makeDeps({
      insightsOut: { budget: "R$ 2.000", intent: "search" },
    });

    // First call: budget=2000 — creates
    await extractInsights(
      { sessionId: "session-1", userMessage: "tenho 2000" },
      harness.deps,
    );
    expect(harness.state.insights).toHaveLength(2); // budget + intent
    expect(harness.mocks.insightCreate).toHaveBeenCalledTimes(2);

    // Second call: budget changes — should update the existing row, not create
    harness.mocks.llmExtract.mockResolvedValueOnce({
      budget: "R$ 3.500",
      intent: "search",
    });
    await extractInsights(
      { sessionId: "session-1", userMessage: "mudei para 3500" },
      harness.deps,
    );

    // Still only 2 rows total; budget row now says "R$ 3.500"
    expect(harness.state.insights).toHaveLength(2);
    expect(harness.mocks.insightUpdate).toHaveBeenCalled();
    const budgetRow = harness.state.insights.find(
      (r) => r.insightKey === "budget",
    );
    expect(budgetRow?.insightValue).toBe("R$ 3.500");
  });

  it("does NOT call update when the existing insight value is unchanged", async () => {
    const harness = makeDeps({
      insightsOut: { budget: "R$ 2.000", intent: "search" },
      initialProcess: { id: "rp-old", tenantId: "tenant-1", status: "TRIAGE" },
      initialInsights: [
        {
          id: "ins-existing",
          rentalProcessId: "rp-old",
          insightKey: "budget",
          insightValue: "R$ 2.000",
        },
        {
          id: "ins-intent",
          rentalProcessId: "rp-old",
          insightKey: "intent",
          insightValue: "search",
        },
      ],
    });

    await extractInsights(
      { sessionId: "session-1", userMessage: "mesmo orçamento" },
      harness.deps,
    );

    expect(harness.mocks.insightUpdate).not.toHaveBeenCalled();
    expect(harness.mocks.insightCreate).not.toHaveBeenCalled();
  });

  it("flips ChatSession to WAITING_HUMAN when intent === 'human_handoff'", async () => {
    const harness = makeDeps({
      insightsOut: { intent: "human_handoff" },
    });

    const result = await extractInsights(
      { sessionId: "session-1", userMessage: "quero falar com um humano" },
      harness.deps,
    );

    expect(result.handoff).toBe(true);
    expect(harness.mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { status: "WAITING_HUMAN" },
    });
  });

  it("does NOT re-flip a session that is already WAITING_HUMAN", async () => {
    const harness = makeDeps({
      session: { id: "session-1", tenantId: "tenant-1", status: "WAITING_HUMAN" },
      insightsOut: { intent: "human_handoff" },
    });

    const result = await extractInsights(
      { sessionId: "session-1", userMessage: "ainda esperando" },
      harness.deps,
    );

    expect(result.handoff).toBe(false);
    expect(harness.mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("forwards the user message to the LLM via buildExtractionMessages", async () => {
    const harness = makeDeps({
      insightsOut: { intent: "other" },
    });

    await extractInsights(
      { sessionId: "session-1", userMessage: "preciso de um 2 quartos em moema" },
      harness.deps,
    );

    const msgs = harness.lastExtractInput;
    expect(msgs).not.toBeNull();
    expect(msgs).toHaveLength(2);
    expect((msgs![1] as HumanMessage).content).toBe(
      "preciso de um 2 quartos em moema",
    );
  });
});
