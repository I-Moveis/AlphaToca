import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/errorHandler';
import webhookRoutes from './routes/webhookRoutes';
import propertyRoutes from './routes/propertyRoutes';
import userRoutes from './routes/userRoutes';
import { checkJwt } from './middlewares/authMiddleware';

const app: Express = express();

app.use(cors());
app.use(express.json());

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', webhookRoutes);
app.use('/api', checkJwt, propertyRoutes);

// User Routes
app.use('/api', checkJwt, userRoutes);

// Apply Global Error Handler
app.use(errorHandler);

export default app;
