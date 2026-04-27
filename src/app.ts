import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import { errorHandler } from './middlewares/errorHandler';
import webhookRoutes from './routes/webhookRoutes';
import propertyRoutes from './routes/propertyRoutes';
import userRoutes from './routes/userRoutes';
import visitRoutes from './routes/visitRoutes';
import { checkJwt, authSyncMiddleware, validateAuthConfig } from './middlewares/authMiddleware';
import prisma from './config/db';
import { queueRedisConnection } from './queues/whatsappQueue';
import { logger } from './config/logger';

// Validate Auth0 configuration at startup
validateAuthConfig();

const app: Express = express();

// Confia no primeiro proxy da cadeia (ngrok em dev, load balancer em produção).
// Sem isso, o express-rate-limit reclama que X-Forwarded-For está presente mas
// o Express não foi instruído a confiar nele — e o IP contado vira o do proxy,
// não o do cliente real.
app.set('trust proxy', 1);

app.use(cors());
app.use(
    express.json({
        verify: (req, _res, buf) => {
            (req as express.Request).rawBody = buf;
        },
    }),
);

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Liveness probe — processo está respondendo.
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe — dependências críticas estão saudáveis.
app.get('/health/ready', async (_req: Request, res: Response) => {
    const checks: Record<'db' | 'redis' | 'gemini', 'ok' | 'fail'> = {
        db: 'fail',
        redis: 'fail',
        gemini: 'fail',
    };

    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.db = 'ok';
    } catch (err) {
        logger.error({ err }, '[health] db check failed');
    }

    try {
        const pong = await queueRedisConnection.ping();
        if (pong === 'PONG') checks.redis = 'ok';
    } catch (err) {
        logger.error({ err }, '[health] redis check failed');
    }

    // Gemini: só confirma presença da chave — não consome cota fazendo call real.
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim() !== '') {
        checks.gemini = 'ok';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    res.status(allOk ? 200 : 503).json({
        status: allOk ? 'ready' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
    });
});

// Protected routes middleware chain
const authStack = [checkJwt, authSyncMiddleware];

// Routes
app.use('/api', webhookRoutes);
app.use('/api', propertyRoutes);

// User Routes
app.use('/api', authStack, userRoutes);

// Visit (booking) Routes
app.use('/api', authStack, visitRoutes);

// Apply Global Error Handler
app.use(errorHandler);

export default app;
