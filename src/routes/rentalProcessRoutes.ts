import { Router } from 'express';
import { rentalProcessController } from '../controllers/rentalProcessController';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Processos de Locação
 *     description: Triagem e insights extraídos por IA
 */

/**
 * @swagger
 * /rental-processes/{id}/insights:
 *   get:
 *     summary: Consultar insights extraídos pela IA para um processo de locação
 *     tags: [Processos de Locação]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Processo encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 processId: { type: string, format: uuid }
 *                 status: { type: string, enum: [TRIAGE, VISIT_SCHEDULED, CONTRACT_ANALYSIS, CLOSED] }
 *                 tenantId: { type: string, format: uuid }
 *                 propertyId: { type: string, format: uuid, nullable: true }
 *                 insights:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       insightKey: { type: string }
 *                       insightValue: { type: string }
 *                       extractedAt: { type: string, format: date-time }
 *       400: { description: ID inválido }
 *       404: { description: Processo não encontrado }
 */
router.get('/rental-processes/:id/insights', rentalProcessController.getInsights);

export default router;
