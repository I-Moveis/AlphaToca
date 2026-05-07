-- US-013: provisiona armazenamento para o ciclo digital do contrato.
-- Decisão (ver scripts/ralph/progress.txt US-013): em vez de criar um novo
-- modelo Contract (Option B do PRD) ou estender RentalProcess (Option A —
-- inviável: faltam startDate/endDate/monthlyValue), estendemos o modelo
-- Contract já existente. Duas mudanças:
--   1. RENAME COLUMN contract_url TO pdf_url — rewrite de catálogo, zero
--      perda de dados; tudo que já estava armazenado em contract_url passa a
--      ser acessível como pdf_url sem `UPDATE`.
--   2. ADD COLUMN signed_at TIMESTAMP(3) NULL — marca o instante do upload
--      do PDF assinado (US-016). Sem default: linhas pré-existentes ficam
--      NULL, que é o estado correto ("ainda não há PDF assinado").

-- RenameColumn
ALTER TABLE "contracts" RENAME COLUMN "contract_url" TO "pdf_url";

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "signed_at" TIMESTAMP(3);
