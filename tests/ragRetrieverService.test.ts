import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  retrieveRelevantChunks,
  toVectorLiteral,
  type RetrieverDeps,
} from "../src/services/ragRetrieverService";
import { RETRIEVER_K } from "../src/config/rag";

type FakeRow = {
  id: string;
  content: string;
  title: string;
  distance: number;
};

function makeDeps(rows: FakeRow[], overrides?: Partial<RetrieverDeps>) {
  const queryCalls: Array<{ sql: string; params: unknown[] }> = [];
  const embedCalls: string[] = [];

  const deps: RetrieverDeps & {
    queryCalls: typeof queryCalls;
    embedCalls: typeof embedCalls;
  } = {
    prisma: {
      $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
        queryCalls.push({ sql, params });
        const limit =
          typeof params[1] === "number" ? params[1] : Number(params[1]);
        return rows.slice(0, limit) as unknown;
      }) as unknown as RetrieverDeps["prisma"]["$queryRawUnsafe"],
    },
    embedder: {
      embedQuery: vi.fn(async (text: string) => {
        embedCalls.push(text);
        return [0.1, 0.2, 0.3, 0.4];
      }),
    },
    queryCalls,
    embedCalls,
    ...overrides,
  };

  return deps;
}

describe("toVectorLiteral", () => {
  it("formats a number array as a pgvector literal string", () => {
    expect(toVectorLiteral([1, 2, 3])).toBe("[1,2,3]");
    expect(toVectorLiteral([])).toBe("[]");
  });
});

describe("retrieveRelevantChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array when the query is blank", async () => {
    const deps = makeDeps([]);
    const out = await retrieveRelevantChunks("", deps);
    expect(out).toEqual([]);
    expect(deps.embedCalls).toHaveLength(0);
    expect(deps.queryCalls).toHaveLength(0);
  });

  it("embeds the query and returns the rows with similarity scores", async () => {
    const rows: FakeRow[] = [
      { id: "a", content: "content-a", title: "Doc A", distance: 0.1 },
      { id: "b", content: "content-b", title: "Doc B", distance: 0.3 },
    ];
    const deps = makeDeps(rows);

    const result = await retrieveRelevantChunks("how do I schedule a visit?", deps);

    expect(deps.embedCalls).toEqual(["how do I schedule a visit?"]);
    expect(deps.queryCalls).toHaveLength(1);
    expect(deps.queryCalls[0].sql).toContain("knowledge_documents");
    expect(deps.queryCalls[0].sql).toContain("embedding IS NOT NULL");
    expect(deps.queryCalls[0].sql).toContain("ORDER BY embedding <=>");
    expect(deps.queryCalls[0].sql).toContain("LIMIT");

    expect(deps.queryCalls[0].params[0]).toBe("[0.1,0.2,0.3,0.4]");
    expect(deps.queryCalls[0].params[1]).toBe(RETRIEVER_K);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "a",
      content: "content-a",
      title: "Doc A",
      score: 1 - 0.1,
    });
    expect(result[1].score).toBeCloseTo(1 - 0.3, 10);
  });

  it("preserves ordering returned by the SQL query", async () => {
    const rows: FakeRow[] = [
      { id: "closest", content: "x", title: "Closest", distance: 0.05 },
      { id: "middle", content: "y", title: "Middle", distance: 0.2 },
      { id: "far", content: "z", title: "Far", distance: 0.9 },
    ];
    const deps = makeDeps(rows);

    const result = await retrieveRelevantChunks("anything", deps);
    const ids = result.map((r) => r.id);
    expect(ids).toEqual(["closest", "middle", "far"]);
    const scores = result.map((r) => r.score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  it("honors the retriever K limit", async () => {
    const rows: FakeRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `row-${i}`,
      content: `content-${i}`,
      title: `Doc ${i}`,
      distance: i * 0.05,
    }));
    const deps = makeDeps(rows);

    const result = await retrieveRelevantChunks("anything", deps);
    expect(result).toHaveLength(RETRIEVER_K);
    expect(deps.queryCalls[0].params[1]).toBe(RETRIEVER_K);
  });

  it("accepts a per-call k override via deps", async () => {
    const rows: FakeRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `row-${i}`,
      content: `content-${i}`,
      title: `Doc ${i}`,
      distance: i * 0.05,
    }));
    const deps = makeDeps(rows, { k: 2 });

    const result = await retrieveRelevantChunks("anything", deps);
    expect(result).toHaveLength(2);
    expect(deps.queryCalls[0].params[1]).toBe(2);
  });

  it("parses string distances from pgvector", async () => {
    const rows = [
      { id: "a", content: "c", title: "t", distance: "0.25" as unknown as number },
    ];
    const deps = makeDeps(rows);

    const result = await retrieveRelevantChunks("q", deps);
    expect(result[0].score).toBeCloseTo(0.75, 10);
  });
});
