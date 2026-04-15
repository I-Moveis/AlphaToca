import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/errorHandler';
import webhookRoutes from './routes/webhookRoutes';
import userRoutes from './routes/userRoutes';
import './workers/whatsappWorker';

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook Routes
app.use('/api', webhookRoutes);

// User Routes
app.use('/api', userRoutes);

// Apply Global Error Handler
app.use(errorHandler);

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
