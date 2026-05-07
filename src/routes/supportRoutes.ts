import { Router } from 'express';
import { supportTicketController } from '../controllers/supportTicketController';

const router = Router();

/**
 * @swagger
 * /support/tickets:
 *   post:
 *     summary: Abrir novo ticket de suporte
 *     description: |
 *       Qualquer usuário autenticado (TENANT, LANDLORD ou ADMIN) pode abrir
 *       um chamado de suporte. O servidor gera o protocolo humano no formato
 *       `SUP-AAMMDD-XXXX` (AAMMDD = data local do servidor, XXXX = 4 chars
 *       base36 uppercase) e retorna o `id` UUID, o `code` e o `createdAt`.
 *
 *       Campos derivados do servidor (nunca aceitos do body):
 *       - `userId`, `userName`, `userRole` — vêm do JWT via `req.localUser`.
 *       - `code` — gerado no servidor; em caso de colisão UNIQUE, regerado
 *         até 5 vezes antes de bubblar 500.
 *       - `createdAt` — `now()` via Prisma `@default(now())`.
 *
 *       Notificação por email ao canal de suporte (via supportEmailService)
 *       acontece após o insert no banco. Falhas no envio de email NÃO
 *       derrubam a request — o ticket é gravado e respondido 201 normalmente.
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 120
 *                 example: App trava ao enviar foto no chat
 *               description:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 4000
 *                 example: |
 *                   Quando eu seleciono a foto na galeria, o app fecha sozinho.
 *                   Acontece sempre no Android 13.
 *     responses:
 *       201:
 *         description: Ticket criado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, code, createdAt]
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 code:
 *                   type: string
 *                   pattern: '^SUP-\d{6}-[A-Z0-9]{4}$'
 *                   example: SUP-260507-A3F2
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Body inválido (title/description ausente ou fora dos limites).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Token ausente ou inválido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/support/tickets', supportTicketController.create);

export default router;
