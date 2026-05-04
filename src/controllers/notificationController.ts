import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';

export const notificationController = {
  /**
   * GET /notifications
   * Lista todas as notificações do usuário autenticado (mais recentes primeiro).
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).localUser.id;

      const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { sentAt: 'desc' },
        take: 50,
      });

      return res.status(200).json({ data: notifications });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /notifications/:id/read
   * Marca uma notificação específica como lida.
   */
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).localUser.id;
      const { id } = req.params;

      const notification = await prisma.notification.findUnique({ where: { id } });

      if (!notification) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Notificação não encontrada.' }],
        });
      }

      if (notification.userId !== userId) {
        return res.status(403).json({
          status: 403,
          code: 'FORBIDDEN',
          messages: [{ message: 'Acesso negado.' }],
        });
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });

      return res.status(200).json({ data: updated });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /notifications/read-all
   * Marca todas as notificações do usuário como lidas.
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).localUser.id;

      const { count } = await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });

      return res.status(200).json({ updated: count });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /notifications/unread-count
   * Retorna a contagem de notificações não lidas (badge do app).
   */
  async unreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).localUser.id;

      const count = await prisma.notification.count({
        where: { userId, readAt: null },
      });

      return res.status(200).json({ count });
    } catch (error) {
      next(error);
    }
  },
};
