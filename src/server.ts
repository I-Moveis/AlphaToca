import app from './app';
import './workers/whatsappWorker';
import { setupSwagger } from './config/swagger';
import { bootstrapLangSmith } from './config/langsmith';

const port = process.env.PORT || 3000;

bootstrapLangSmith();

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
