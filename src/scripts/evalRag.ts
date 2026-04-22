import prisma from "../config/db";
import { assertRagSecrets } from "../config/rag";
import { generateAnswer } from "../services/ragChainService";
import { retrieveRelevantChunks } from "../services/ragRetrieverService";

const QUESTIONS: ReadonlyArray<string> = [
  "Como funciona o processo de triagem de inquilinos no AlphaToca?",
  "Quais documentos preciso enviar para alugar um imóvel?",
  "Posso agendar uma visita para amanhã de manhã?",
  "Qual é a forma de pagamento do aluguel todo mês?",
  "Aceitam animais de estimação nos imóveis?",
  "Como faço para rescindir o contrato antes do prazo?",
  "Quem paga as taxas de condomínio e IPTU?",
  "O AlphaToca cobra alguma taxa do inquilino no início do contrato?",
];

function truncate(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export async function runEvaluation(questions: ReadonlyArray<string>): Promise<void> {
  const sessionId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`\n=== [${i + 1}/${questions.length}] ${question} ===`);

    let topTitle = "(nenhum chunk recuperado)";
    let topScore = 0;
    try {
      const chunks = await retrieveRelevantChunks(question);
      if (chunks.length > 0) {
        topTitle = chunks[0].title;
        topScore = chunks[0].score;
      }
    } catch (err) {
      console.error(`  [retriever error] ${(err as Error).message}`);
    }

    try {
      const result = await generateAnswer({ sessionId, userMessage: question });
      console.log(`  top chunk:   ${topTitle}`);
      console.log(`  similarity:  ${topScore.toFixed(3)} (chain topScore=${result.topScore.toFixed(3)})`);
      console.log(`  handoff:     ${result.handoff}`);
      console.log(`  answer:      ${truncate(result.answer, 500)}`);
    } catch (err) {
      console.error(`  [chain error] ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  assertRagSecrets();
  console.log(`[eval:rag] running ${QUESTIONS.length} questions against the RAG pipeline...`);
  await runEvaluation(QUESTIONS);
  console.log(`\n[eval:rag] done.`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[eval:rag] failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
