import axios from 'axios';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v20.0';
const ACCESS_TOKEN = process.env.TOKEN_ACCES_WHATSAPP?.trim();
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID?.trim();

if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error('[WhatsAppService] TOKEN_ACCES_WHATSAPP e PHONE_NUMBER_ID devem estar definidos no .env');
}

export interface SendMessageResponse {
    messaging_product?: string;
    contacts?: Array<{ input: string; wa_id: string }>;
    messages: Array<{ id: string }>;
}

export async function sendMessage(to: string, text: string): Promise<SendMessageResponse> {
    const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`;

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
    return response.data as SendMessageResponse;
}
