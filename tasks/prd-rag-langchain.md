# PRD: RAG Implementation with LangChain for WhatsApp Chatbot

## 1. Introduction / Overview

The AlphaToca chatbot operates over WhatsApp and answers customer/tenant
questions about property rentals. Today the backend has the inbound webhook,
BullMQ queue, Prisma schema (including a `KnowledgeDocument` model with a
`vector(1536)` embedding column and `pgvector` enabled), and a `whatsappWorker`
skeleton — but no grounded answer generation.

This feature adds a Retrieval-Augmented Generation (RAG) pipeline built on
LangChain that:

1. Ingests Markdown files from `documentation/` into `KnowledgeDocument` as
   chunked, embedded content.
2. Retrieves the most relevant chunks for each incoming WhatsApp message.
3. Generates an answer grounded in those chunks + the active `ChatSession`'s
   prior `Message`s, matching the tone defined in
   `documentation/buisness_plan.md` (professional, welcoming, objective,
   trustworthy, Portuguese).
4. Extracts structured lead insights (budget, desired neighborhood, bedrooms,
   pets, etc.) and persists them to `RentalProcess` / `AiExtractedInsight`.
5. Hands off to a human agent (flips `ChatSession.status` to `WAITING_HUMAN`)
   when retrieval confidence is low or the user explicitly asks for one.

This replaces the current echo/no-op response path in `whatsappWorker.ts` with
a real LLM-backed reply.

## 2. Goals

- Answer WhatsApp questions grounded in the `documentation/` folder with >=80%
  of evaluation questions judged "correct + on-tone" by a manual rubric on a
  seed test set.
- Re-ingest unchanged documents as a no-op (idempotent ingestion via content
  hash), so re-running the seed script does not duplicate rows or re-bill
  embedding calls.
- End-to-end latency per inbound WhatsApp message (webhook receipt →
  outbound WhatsApp send) p50 <= 4s, p95 <= 8s, excluding WhatsApp API time.
- Extract at least the insight keys `budget`, `neighborhood`, `bedrooms`,
  `pets_allowed`, `intent` into `AiExtractedInsight` whenever the user
  supplies them, with an attached `RentalProcess` in `TRIAGE` status.
- Transition to `WAITING_HUMAN` for any turn where the retriever's top-1
  similarity falls below a configurable threshold OR the user intent is
  classified as `human_handoff`.

## 3. User Stories

### US-001: Define ingestion pipeline shape and config

**Description:** As a developer, I want a single config module that centralizes
the embedding model, chunking strategy, and retrieval parameters so the rest of
the RAG code reads them from one place.

**Acceptance Criteria:**
- [ ] New file `src/config/rag.ts` exports typed constants:
  `EMBEDDING_MODEL = "text-embedding-3-small"`, `EMBEDDING_DIMS = 1536`,
  `CHUNK_SIZE = 800`, `CHUNK_OVERLAP = 120`, `RETRIEVER_K = 4`,
  `SIMILARITY_THRESHOLD = 0.72`.
- [ ] Reads `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` from `process.env`, fails
      fast with a clear error at boot if either is missing.
- [ ] Typecheck (`npx tsc --noEmit`) passes.

### US-002: Extend `KnowledgeDocument` with ingestion-tracking fields

**Description:** As a developer, I want to track the source file, chunk index,
and content hash per row so re-ingestion can skip unchanged chunks.

**Acceptance Criteria:**
- [ ] Add to `KnowledgeDocument`: `sourcePath String`, `chunkIndex Int`,
      `contentHash String`, `createdAt DateTime @default(now())`,
      `updatedAt DateTime @updatedAt`.
- [ ] Add compound unique index on `(sourcePath, chunkIndex)` so upserts are
      deterministic.
- [ ] Add index on `contentHash` for fast skip lookups.
- [ ] Prisma migration generated and applied against a local DB
      (`npx prisma migrate dev --name add_rag_ingestion_tracking`).
- [ ] `npx prisma generate` runs cleanly.
- [ ] Typecheck passes.

### US-003: Build the ingestion CLI script

**Description:** As a developer, I want `npm run ingest:knowledge` to walk
`documentation/`, chunk every `.md` file, embed new/changed chunks, and upsert
them into `KnowledgeDocument`.

**Acceptance Criteria:**
- [ ] New script `src/scripts/ingestKnowledge.ts` that:
  - [ ] Reads all `*.md` files under `documentation/` recursively.
  - [ ] Splits each file with LangChain `RecursiveCharacterTextSplitter`
        using `CHUNK_SIZE` / `CHUNK_OVERLAP` from `src/config/rag.ts`.
  - [ ] Computes `sha256(content)` per chunk as `contentHash`.
  - [ ] Looks up existing row by `(sourcePath, chunkIndex)`:
    - If no row exists → embed + insert.
    - If row exists and `contentHash` matches → skip (no embedding call).
    - If row exists and `contentHash` differs → embed + update.
  - [ ] Deletes rows whose `(sourcePath, chunkIndex)` no longer exists in the
        file (file shrank or was deleted).
  - [ ] Writes embeddings via raw SQL (`$executeRaw`) because `pgvector` is
        `Unsupported` in Prisma Client; use
        `UPDATE knowledge_documents SET embedding = $1::vector WHERE id = $2`.
  - [ ] Logs a summary: N files, X inserted, Y updated, Z skipped, W deleted.
- [ ] New npm script: `"ingest:knowledge": "ts-node src/scripts/ingestKnowledge.ts"`.
- [ ] Running the script twice in a row produces `0 inserted, 0 updated,
      N skipped` on the second run.
- [ ] Unit test covers the hash-skip logic with mocked embeddings + mocked
      Prisma client.
- [ ] Typecheck passes; tests pass (`npm test`).

### US-004: Implement the pgvector retriever

**Description:** As a developer, I want a LangChain `VectorStoreRetriever` that
queries `KnowledgeDocument` by cosine similarity and returns the top K chunks
plus their similarity scores.

**Acceptance Criteria:**
- [ ] New module `src/services/ragRetrieverService.ts` exports
      `retrieveRelevantChunks(query: string): Promise<RetrievedChunk[]>`
      where `RetrievedChunk = { id, content, title, score }`.
- [ ] Generates the query embedding with the same `EMBEDDING_MODEL` used for
      ingestion.
- [ ] Runs a single raw SQL query using the pgvector cosine operator
      (`<=>` for distance or `1 - (embedding <=> $1)` for similarity),
      `ORDER BY embedding <=> $1 ASC LIMIT K`.
- [ ] Rows with `embedding IS NULL` are excluded.
- [ ] Unit test with a seeded in-memory fixture (or mocked Prisma) verifies
      ordering and K limit.
- [ ] Typecheck passes; tests pass.

### US-005: Build the conversational RAG chain

**Description:** As a developer, I want a single function that, given a user
message and a `ChatSession.id`, produces a grounded Portuguese reply.

**Acceptance Criteria:**
- [ ] New module `src/services/ragChainService.ts` exports
      `generateAnswer(input: { sessionId: string; userMessage: string })`.
- [ ] Loads the last 10 `Message`s for the session (ordered by `timestamp ASC`)
      and formats them as LangChain `HumanMessage` / `AIMessage` history.
- [ ] Calls `retrieveRelevantChunks(userMessage)` and concatenates the chunk
      text into a `context` string. If no chunk exceeds `SIMILARITY_THRESHOLD`,
      returns `{ answer: <fallback text>, handoff: true }` without calling
      the LLM.
- [ ] Builds a prompt that includes:
  - A Portuguese system prompt encoding the tone rules from
    `documentation/buisness_plan.md` section 6 (professional, welcoming,
    trustworthy; only answer from provided context; hand off if unsure).
  - The retrieved `context`.
  - The chat history.
  - The new user message.
- [ ] Calls Claude Sonnet 4.6 via `@langchain/anthropic` with
      `temperature: 0.2`.
- [ ] Returns `{ answer: string, handoff: boolean, topScore: number,
      usedChunkIds: string[] }`.
- [ ] Unit test with a mocked LLM + mocked retriever verifies:
  - Low-score path returns `handoff: true` without invoking the LLM.
  - High-score path returns the LLM output and `handoff: false`.
  - Chat history is included in the prompt (assert on the prompt string).
- [ ] Typecheck passes; tests pass.

### US-006: Wire the RAG chain into `whatsappWorker.ts`

**Description:** As a user on WhatsApp, when I send a message the bot should
reply with a grounded answer and persist both sides of the conversation.

**Acceptance Criteria:**
- [ ] `whatsappWorker.ts` job handler, for each inbound message:
  1. Finds-or-creates a `User` by `phoneNumber`.
  2. Finds the active `ChatSession` for that user (status `ACTIVE_BOT`) or
     creates one.
  3. If the session status is `WAITING_HUMAN` or `RESOLVED`, persist the
     inbound `Message` and return (do NOT auto-reply).
  4. Persists the inbound `Message` with `senderType: TENANT`.
  5. Calls `generateAnswer({ sessionId, userMessage })`.
  6. Persists the outbound `Message` with `senderType: BOT`.
  7. If `handoff` is true, updates `ChatSession.status` to `WAITING_HUMAN`.
  8. Sends the answer text via the existing `whatsappService` outbound call.
- [ ] Errors from the RAG chain are caught; the worker sends a generic
      Portuguese apology message and flips the session to `WAITING_HUMAN` so a
      human can recover.
- [ ] Integration-style unit test with mocked Prisma + mocked
      `whatsappService` + mocked `generateAnswer` covers:
  - Happy path: tenant message in → bot message out → both persisted.
  - Handoff path: status flips to `WAITING_HUMAN`.
  - Already-`WAITING_HUMAN` path: no auto-reply sent.
- [ ] Typecheck passes; tests pass.

### US-007: Extract structured lead insights

**Description:** As an operator, I want the chatbot to capture the tenant's
rental preferences (budget, neighborhood, bedrooms, pets, intent) into the
database so a human can follow up with real listings.

**Acceptance Criteria:**
- [ ] New module `src/services/leadExtractionService.ts` exports
      `extractInsights(input: { sessionId: string; userMessage: string }):
      Promise<ExtractedInsights>`.
- [ ] Uses LangChain structured output with a Zod schema:
      `{ budget?: number, neighborhood?: string, bedrooms?: number,
      pets_allowed?: boolean, intent: "search" | "schedule_visit" |
      "contract_question" | "human_handoff" | "other" }`.
- [ ] Runs against the same Claude Sonnet 4.6 model; `temperature: 0`.
- [ ] Invoked from `whatsappWorker.ts` AFTER the reply is sent (so it does not
      add latency to the user-facing turn — use `queueMicrotask` or a separate
      BullMQ job).
- [ ] Finds-or-creates a `RentalProcess` for the tenant with status `TRIAGE`
      (one open process per tenant at a time).
- [ ] For each non-null extracted key, upserts an `AiExtractedInsight` row
      (`insightKey` / `insightValue`); updates existing rows rather than
      duplicating.
- [ ] If `intent === "human_handoff"`, flips the `ChatSession` to
      `WAITING_HUMAN` (even if the retriever confidence was high).
- [ ] Unit test with mocked LLM verifies: insights are parsed, `RentalProcess`
      is created once per tenant, insight rows are upserted (second call with
      new budget updates the row, doesn't insert a new one).
- [ ] Typecheck passes; tests pass.

### US-008: Seed script for smoke testing

**Description:** As a developer, I want an evaluation fixture so I can spot-
check RAG quality without touching WhatsApp.

**Acceptance Criteria:**
- [ ] New script `src/scripts/evalRag.ts` reads a hard-coded array of ~8
      Portuguese test questions (covering triagem, visita, documentação,
      rescisão, pagamento — mapped to `buisness_plan.md` section 5).
- [ ] For each question, calls `generateAnswer` with a throwaway
      `ChatSession` and prints: question, top chunk title, similarity score,
      `handoff` flag, final answer.
- [ ] New npm script `"eval:rag": "ts-node src/scripts/evalRag.ts"`.
- [ ] Typecheck passes.

## 4. Functional Requirements

- **FR-1 — Embedding model:** Use OpenAI `text-embedding-3-small` (1536 dims)
  for both ingestion and query. No change to the existing `vector(1536)`
  column.
- **FR-2 — Answer model:** Use Anthropic Claude Sonnet 4.6
  (`claude-sonnet-4-6`) via `@langchain/anthropic` for answer generation and
  structured extraction. `temperature: 0.2` for answers, `0` for extraction.
- **FR-3 — Ingestion source:** All `*.md` files under `documentation/`
  (recursive). No other extensions, no code files.
- **FR-4 — Chunking:** `RecursiveCharacterTextSplitter`, `CHUNK_SIZE = 800`,
  `CHUNK_OVERLAP = 120`, default separators. Chunks smaller than 40 chars
  after splitting are dropped.
- **FR-5 — Ingestion idempotency:** Upsert by `(sourcePath, chunkIndex)`;
  skip when `contentHash` is unchanged; delete orphaned chunk indices.
- **FR-6 — Retrieval:** Top-K = 4 chunks by cosine distance via pgvector
  `<=>` operator. Return similarity = `1 - distance`. Exclude rows with
  `NULL` embeddings.
- **FR-7 — Confidence gate:** If the top-1 similarity is below
  `SIMILARITY_THRESHOLD = 0.72`, skip the LLM call and return a handoff
  response.
- **FR-8 — Handoff message:** When handoff fires, reply with a Portuguese
  message along the lines of: "Obrigado pela mensagem! Vou transferir seu
  atendimento para um de nossos consultores para garantir a melhor resposta."
  (Exact copy finalized during US-005.)
- **FR-9 — Chat history:** Include the last 10 `Message`s of the active
  `ChatSession` (oldest first) in the prompt, mapped to
  `HumanMessage` (TENANT/LANDLORD) and `AIMessage` (BOT).
- **FR-10 — Message persistence:** Both inbound (TENANT) and outbound (BOT)
  messages are persisted in `Message` with the correct `senderType` and
  `sessionId`.
- **FR-11 — Status transitions:** `ChatSession.status` flips to
  `WAITING_HUMAN` when (a) similarity is below threshold, (b) the lead
  extractor classifies `intent = "human_handoff"`, or (c) the RAG chain
  throws an uncaught error.
- **FR-12 — Lead extraction:** Runs after the outbound reply. Upserts
  `AiExtractedInsight` for non-null keys: `budget`, `neighborhood`,
  `bedrooms`, `pets_allowed`, `intent`. Ensures exactly one open
  `RentalProcess` (status `TRIAGE`) per tenant.
- **FR-13 — Secrets:** `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` loaded via
  `dotenv`; absence causes fail-fast at boot of any script/worker that needs
  them.
- **FR-14 — System prompt language:** The system prompt is written in
  Portuguese, derived from `documentation/buisness_plan.md` section 6
  (tone of voice: profissional, acolhedor, objetivo, confiável;
  only answer from provided context).

## 5. Non-Goals (Out of Scope)

- No ingestion of PDFs, DOCX, spreadsheets, property listings, or DB content
  — Markdown under `documentation/` only.
- No re-ranking layer (Cohere Rerank, bge-reranker, etc.) on top of vector
  search.
- No hybrid search (BM25 + vector). Pure vector for now.
- No streaming responses to WhatsApp (WhatsApp doesn't support streaming
  anyway).
- No admin UI to manage `KnowledgeDocument` rows — ingestion is CLI-only.
- No visit scheduling logic, no property-matching recommendation engine, no
  contract generation. Those are separate phases.
- No authentication/authorization changes; RAG runs inside the existing
  worker context.
- No multi-tenant isolation of knowledge docs (single-org deployment).
- No cost / token usage dashboards. Logging only.
- No auto-ingestion on file change or server boot — explicit CLI run only.
- No integration with LangSmith tracing beyond default env-var wiring
  (`LANGCHAIN_TRACING_V2=true`); dashboards and alerts are out of scope.

## 6. Design Considerations

- **System prompt (Portuguese, starting point — finalize in US-005):**
  > Você é o atendente virtual da AlphaToca, uma plataforma de aluguel de
  > imóveis. Seu tom é profissional, acolhedor, objetivo e confiável.
  > Responda sempre em português do Brasil. Use **apenas** as informações do
  > CONTEXTO fornecido para responder. Se a resposta não estiver no contexto,
  > ou se houver qualquer sinal de negociação sensível ou litígio, diga ao
  > usuário que você vai transferir o atendimento para um consultor humano.
- **Prompt shape:** System prompt → `CONTEXT:\n<chunks joined with \n---\n>`
  → chat history messages → new user message.
- **Chunk rendering in context:** `"[${title}]\n${content}"` for each chunk,
  joined with `\n\n---\n\n`. Title comes from the Markdown filename
  (no extension) until per-chunk titling is added.
- **Reuse:** `src/services/whatsappService.ts` for outbound sends;
  `src/workers/whatsappWorker.ts` as the single entry point; Prisma client
  from wherever it's currently instantiated (do not create a second one).

## 7. Technical Considerations

- **pgvector via Prisma:** `KnowledgeDocument.embedding` is `Unsupported` in
  Prisma Client, so embeddings must be written/read via `$executeRawUnsafe`
  / `$queryRawUnsafe` with explicit `::vector` casts. Use parameterized
  queries; never interpolate user input. Example:
  `UPDATE knowledge_documents SET embedding = $1::vector WHERE id = $2`.
- **Index:** Add an IVFFlat or HNSW index on `knowledge_documents.embedding`
  once the table has >1k rows. For the MVP (tens of chunks) a seq scan is
  fine — flag it in US-002 as a follow-up, not a blocker.
- **Error budget:** OpenAI and Anthropic are both external; wrap both in a
  30s timeout and a single retry on network error. Anything worse triggers
  the handoff path in FR-11c.
- **LangChain version:** `langchain@^1.3.3` and `@langchain/core@^1.1.40` are
  pinned — use the v1 chain APIs (LCEL `RunnableSequence`,
  `ChatPromptTemplate`), not the deprecated `ConversationalRetrievalChain`.
- **Post-reply work:** Lead extraction runs after the outbound reply is sent
  so user-facing latency is not affected. Cleanest implementation is to
  enqueue a separate BullMQ job on the same Redis connection; fallback is
  `queueMicrotask` if queue scaffolding for a second queue is too heavy for
  this PRD.
- **Cost control:** `text-embedding-3-small` at current pricing keeps a full
  re-ingest of `documentation/` under $0.01. Claude Sonnet 4.6 per-turn cost
  is the dominant variable — capping chat history at 10 messages and
  retrieved context at 4 chunks bounds input tokens.
- **Tests:** Follow the existing `vitest` pattern (`tests/` directory). Mock
  Prisma with a minimal in-memory shim and mock the LLM / embeddings clients
  so tests do not require API keys.

## 8. Success Metrics

- **Accuracy:** >=80% of the 8-question eval set (US-008) returns answers
  judged "correct + on-tone" on a manual pass by the product owner.
- **Handoff rate:** On the eval set, handoff fires on 0 of the 8 in-scope
  questions (all should be answerable from `buisness_plan.md`). Out-of-scope
  probe questions (e.g., "qual a cor do céu?") must trigger handoff.
- **Idempotent ingest:** Second run of `npm run ingest:knowledge` reports
  `0 inserted, 0 updated, 0 deleted`.
- **Latency:** p50 <= 4s, p95 <= 8s from job pickup to outbound send, measured
  over the first 50 real messages in staging.
- **Data capture:** >=60% of tenant conversations that contain at least one
  preference (budget/neighborhood/bedrooms/pets) produce at least one
  `AiExtractedInsight` row within the same conversation.

## 9. Open Questions

- **Handoff notification:** When a session flips to `WAITING_HUMAN`, who is
  notified? (Slack? Email? Separate admin UI?) Out of scope for this PRD but
  needs a downstream ticket.
- **Chunk titling:** Should chunk titles come from the nearest Markdown
  heading (`#`, `##`) rather than the filename? Would improve retrieval
  quality slightly. Defer unless eval accuracy is below target.
- **Threshold tuning:** `SIMILARITY_THRESHOLD = 0.72` is a guess. After the
  first eval run on real docs, this may need to move — leave it as a single
  constant in `src/config/rag.ts` to make tuning trivial.
- **Language detection:** Assumed all inbound messages are Portuguese.
  Do we need an English fallback for foreign students? Out of scope unless
  product says otherwise.
- **PII in logs:** Lead insights contain personal preferences. Confirm
  logging policy before merging (redact `insightValue` in production logs?).
