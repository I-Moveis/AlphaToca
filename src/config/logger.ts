import pino, { Logger } from 'pino';

/**
 * Logger estruturado do AlphaToca.
 *
 * - Em desenvolvimento (NODE_ENV != production), usa pino-pretty para output colorido.
 * - Em produção, emite JSON puro (ingestável por Loki, CloudWatch, Datadog, etc).
 * - Nível configurável via LOG_LEVEL (default 'info'; em testes, 'silent').
 *
 * Use `logger.child({ requestId, jobId, wamid })` para propagar correlation IDs.
 */
function resolveLevel(): string {
    if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
    if (process.env.NODE_ENV === 'test') return 'silent';
    return 'info';
}

function buildLogger(): Logger {
    const level = resolveLevel();
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        return pino({ level });
    }

    return pino({
        level,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname',
            },
        },
    });
}

export const logger: Logger = buildLogger();

export type { Logger };
