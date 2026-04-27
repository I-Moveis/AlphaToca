/**
 * Constantes do domínio de visitas. Single source of truth — Zod schema,
 * serviço e janela SQL devem derivar daqui, senão a janela de detecção
 * de conflito fica dessincronizada do máximo permitido pela validação
 * e visitas longas deixam de ser consideradas conflitos silenciosamente.
 */
export const MIN_VISIT_DURATION_MINUTES = 15 as const;
export const MAX_VISIT_DURATION_MINUTES = 180 as const;
export const DEFAULT_VISIT_DURATION_MINUTES = 45 as const;
