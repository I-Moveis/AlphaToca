import app from './app';
import './workers/whatsappWorker';
import { setupSwagger } from './config/swagger';
import { bootstrapLangSmith } from './config/langsmith';

const port = process.env.PORT || 3000;

// Inicializa integrações
bootstrapLangSmith();
setupSwagger(app); // Habilita a documentação visual do Swagger

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
