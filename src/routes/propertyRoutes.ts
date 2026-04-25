import { Router } from 'express';
import { propertyController } from '../controllers/propertyController';

const router = Router();

/**
 * @swagger
 * /properties:
 *   post:
 *     summary: Criar uma nova propriedade
 *     tags: [Propriedades]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [landlordId, title, description, price, address]
 *             properties:
 *               landlordId:
 *                 type: string
 *                 format: uuid
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               address:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, IN_NEGOTIATION, RENTED]
 *     responses:
 *       201:
 *         description: Propriedade criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       400:
 *         description: Erro de validação nos dados enviados
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/properties', propertyController.create);

router.get('/properties', propertyController.list);

/**
 * @swagger
 * /properties/search:
 *   get:
 *     summary: Busca avançada de propriedades com filtros e paginação
 *     tags: [Propriedades]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [APARTMENT, HOUSE, STUDIO, CONDO_HOUSE]
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: minBedrooms
 *         schema:
 *           type: integer
 *       - in: query
 *         name: minBathrooms
 *         schema:
 *           type: integer
 *       - in: query
 *         name: minParkingSpots
 *         schema:
 *           type: integer
 *       - in: query
 *         name: minArea
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxArea
 *         schema:
 *           type: number
 *       - in: query
 *         name: isFurnished
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: petsAllowed
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: nearSubway
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [createdAt, views, priceAsc, priceDesc, isFeatured]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Resultados da busca
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Property'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/properties/search', propertyController.search);

/**
 * @swagger
 * /properties/{id}:
 *   get:
 *     summary: Recuperar uma propriedade pelo ID
 *     tags: [Propriedades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Propriedade encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       404:
 *         description: Propriedade não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/properties/:id', propertyController.getById);

/**
 * @swagger
 * /properties/{id}:
 *   put:
 *     summary: Atualizar uma propriedade
 *     tags: [Propriedades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Property'
 *     responses:
 *       200:
 *         description: Propriedade atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       400:
 *         description: Erro de validação
 *       404:
 *         description: Propriedade não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/properties/:id', propertyController.update);

/**
 * @swagger
 * /properties/{id}:
 *   delete:
 *     summary: Deletar uma propriedade
 *     tags: [Propriedades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Propriedade deletada com sucesso
 *       404:
 *         description: Propriedade não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.delete('/properties/:id', propertyController.delete);

export default router;
