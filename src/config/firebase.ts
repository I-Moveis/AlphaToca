import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

// Validação para garantir que as credenciais existem
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`[Firebase] Aviso: Variável de ambiente faltando - ${envVar}`);
  }
}

try {
  // Inicializamos o app verificando se as variáveis essenciais existem
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Garante que as quebras de linha literais (\n) do .env sejam traduzidas corretamente
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log('[Firebase] Admin SDK inicializado com sucesso.');
  } else {
    console.warn('[Firebase] Não inicializado. Credenciais incompletas no .env.');
  }
} catch (error) {
  console.error('[Firebase] Erro ao inicializar Admin SDK:', error);
}

export default admin;
