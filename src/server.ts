import app from './app';
import './workers/whatsappWorker';
import { setupSwagger } from './config/swagger';

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
