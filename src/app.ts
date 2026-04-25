import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/errorHandler';
import webhookRoutes from './routes/webhookRoutes';
import propertyRoutes from './routes/propertyRoutes';
import userRoutes from './routes/userRoutes';
import visitRoutes from './routes/visitRoutes';
import { checkJwt, authSyncMiddleware, validateAuthConfig } from './middlewares/authMiddleware';

// Validate Auth0 configuration at startup
validateAuthConfig();

const app: Express = express();

app.use(cors());
app.use(express.json());

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes middleware chain
const authStack = [checkJwt, authSyncMiddleware];

// Routes
app.use('/api', webhookRoutes);
app.use('/api', authStack, propertyRoutes);

// User Routes
app.use('/api', authStack, userRoutes);

// Visit (booking) Routes
app.use('/api', authStack, visitRoutes);

// Apply Global Error Handler
app.use(errorHandler);

export default app;
