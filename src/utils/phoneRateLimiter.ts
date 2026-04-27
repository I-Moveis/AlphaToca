import type Redis from 'ioredis';

export interface PhoneRateLimitResult {
    allowed: boolean;
    count: number;
    limit: number;
    retryAfterSeconds: number;
}

export interface PhoneRateLimiterOptions {
    limit?: number;
    windowSeconds?: number;
    keyPrefix?: string;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW = 60;

/**
 * Rate limit por phoneNumber usando Redis INCR + EXPIRE.
 *
 * A primeira mensagem numa janela de `windowSeconds` seta a TTL;
 * mensagens subsequentes apenas incrementam o contador. Quando o
 * contador passa de `limit`, a função retorna `allowed: false` e o
 * caller deve pular o processamento (ou enviar uma mensagem de
 * aviso ao usuário).
 *
 * Usa keys TTL-isoladas por phoneNumber — não segura nenhuma conexão,
 * não bloqueia, operação atômica no Redis.
 */
export async function checkPhoneRateLimit(
    redis: Pick<Redis, 'incr' | 'expire' | 'ttl'>,
    phoneNumber: string,
    options: PhoneRateLimiterOptions = {},
): Promise<PhoneRateLimitResult> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW;
    const prefix = options.keyPrefix ?? 'rl:phone';
    const key = `${prefix}:${phoneNumber}`;

    const count = await redis.incr(key);
    if (count === 1) {
        await redis.expire(key, windowSeconds);
    }

    if (count > limit) {
        const ttl = await redis.ttl(key);
        return {
            allowed: false,
            count,
            limit,
            retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
        };
    }

    return { allowed: true, count, limit, retryAfterSeconds: 0 };
}
