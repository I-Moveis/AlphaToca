import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/errorHandler';
import webhookRoutes from './routes/webhookRoutes';
import propertyRoutes from './routes/propertyRoutes';
import userRoutes from './routes/userRoutes';
import './workers/whatsappWorker';
import { setupSwagger } from './config/swagger';

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Swagger Documentation
setupSwagger(app);

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', webhookRoutes);
app.use('/api', propertyRoutes);

// User Routes
app.use('/api', userRoutes);

// Apply Global Error Handler
app.use(errorHandler);

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
