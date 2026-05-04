import { Router } from 'express';
import { notificationController } from '../controllers/notificationController';

const router = Router();

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Retorna a contagem de notificações não lidas (badge do app)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contagem de não lidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: Token ausente ou inválido
 */
router.get('/notifications/unread-count', notificationController.unreadCount);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Lista as notificações do usuário autenticado (últimas 50)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de notificações
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       title:
 *                         type: string
 *                       body:
 *                         type: string
 *                       data:
 *                         type: object
 *                       readAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       sentAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Token ausente ou inválido
 */
router.get('/notifications', notificationController.list);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Marca todas as notificações do usuário como lidas
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quantidade de notificações atualizadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 updated:
 *                   type: integer
 *       401:
 *         description: Token ausente ou inválido
 */
router.patch('/notifications/read-all', notificationController.markAllAsRead);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Marca uma notificação específica como lida
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notificação marcada como lida
 *       403:
 *         description: Notificação não pertence ao usuário
 *       404:
 *         description: Notificação não encontrada
 *       401:
 *         description: Token ausente ou inválido
 */
router.patch('/notifications/:id/read', notificationController.markAsRead);

export default router;
