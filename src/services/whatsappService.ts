import axios from 'axios';
import prisma from '../config/db';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v20.0';
const ACCESS_TOKEN = process.env.TOKEN_ACCES_WHATSAPP?.trim();
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID?.trim();

if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error('[WhatsAppService] TOKEN_ACCES_WHATSAPP e PHONE_NUMBER_ID devem estar definidos no .env');
}

export async function sendMessage(to: string, text: string): Promise<any> {
    const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`;

    // 1. Enviar para a Meta (WhatsApp)
    const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
    };

    console.log(`\x1b[35m[WhatsAppService]\x1b[0m JSON enviado para Meta:\n${JSON.stringify(payload, null, 2)}`);

    let response;
    try {
        response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
    } catch (error: any) {
        if (error.response) {
            console.error(`\x1b[31m--- ERRO DETALHADO DA META ---\x1b[0m\n${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(`\x1b[31m[WhatsAppService]\x1b[0m Erro inesperado no envio:`, error.message);
        }
        throw error;
    }

    console.log(`\x1b[32m[WhatsAppService]\x1b[0m ID da mensagem na Meta: ${response.data.messages[0].id}`);

    // 2. Persistir no Banco de Dados
    try {
        // Busca o usuário (deve existir, pois o worker acabou de criar/sync)
        const user = await prisma.user.findUnique({
            where: { phoneNumber: to }
        });

        if (user) {
            // Busca ou cria uma sessão ativa
            let chatSession = await prisma.chatSession.findFirst({
                where: { tenantId: user.id, status: 'ACTIVE_BOT' },
                orderBy: { startedAt: 'desc' }
            });

            if (!chatSession) {
                chatSession = await prisma.chatSession.create({
                    data: { tenantId: user.id, status: 'ACTIVE_BOT' }
                });
            }

            // Salva a mensagem de saída
            await prisma.message.create({
                data: {
                    sessionId: chatSession.id,
                    senderType: 'BOT',
                    content: text
                }
            });
            console.log(`\x1b[34m[WhatsAppService]\x1b[0m Resposta salva no banco para ${to}`);
        }
    } catch (dbError) {
        console.error('[WhatsAppService] Erro ao persistir mensagem de saída:', dbError);
        // Não lançamos o erro aqui para não travar o fluxo se o envio para a Meta já deu certo
    }

    return response.data;
}