import type { NotificationCategory } from '@prisma/client';
import prisma from '../config/db';

/**
 * Shape exposed to the /notifications screen (US-013). Intentionally narrower
 * than the raw Prisma row — drops `type` (FCM-dispatch taxonomy, noisy for the
 * end user), `data` (deep-link payload, not rendered in the list), and `userId`
 * (redundant with the auth context). `read` is a derived boolean so the client
 * doesn't need to null-check `readAt`.
 */
export type NotificationView = {
  id: string;
  title: string;
  body: string;
  receivedAt: string; // ISO
  read: boolean;
  category: NotificationCategory;
};

export const notificationService = {
  /**
   * Lists the authenticated user's notifications, newest first.
   *
   * Filters strictly by `userId = owner.id` — no cross-user leak. When
   * `unreadOnly` is true, only notifications with `readAt IS NULL` are
   * returned; otherwise the full history is returned.
   *
   * Ordered by `receivedAt DESC` via the `(user_id, received_at)` index
   * added in migration `20260510000000_extend_notification_for_history`.
   * Limited to 200 rows — the /notifications screen is a history view,
   * not an audit log; older rows roll off the client anyway.
   */
  async listForUser(
    userId: string,
    opts: { unreadOnly?: boolean } = {},
  ): Promise<NotificationView[]> {
    const where: { userId: string; readAt?: null } = { userId };
    if (opts.unreadOnly) {
      where.readAt = null;
    }

    const rows = await prisma.notification.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        body: true,
        receivedAt: true,
        readAt: true,
        category: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      receivedAt: r.receivedAt.toISOString(),
      read: r.readAt !== null,
      category: r.category,
    }));
  },
};
