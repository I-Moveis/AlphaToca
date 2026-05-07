import { getIO } from '../config/socket';
import { logger } from '../config/logger';

interface MessagePayload {
  id: string;
  sessionId: string;
  senderType: string;
  content: string;
  mediaUrl?: string | null;
  status?: string;
  timestamp: Date;
  wamid?: string | null;
}

export interface NewMessageEvent {
  sessionId: string;
  message: MessagePayload;
}

export interface SessionUpdatedEvent {
  sessionId: string;
  status: string;
}

export const chatSocketService = {
  emitNewMessage(
    tenantId: string,
    payload: NewMessageEvent,
    landlordId?: string | null,
  ): void {
    const io = getIO();
    io.to(`user:${tenantId}`).emit('new_message', payload);

    const { message } = payload;
    if (message.senderType === 'TENANT' || message.senderType === 'BOT') {
      if (landlordId) {
        io.to(`landlord:${landlordId}`).emit('new_message', payload);
      }
      io.to('provider:all').emit('new_message', payload);
    }

    logger.info(
      { tenantId, sessionId: payload.sessionId, messageId: payload.message.id, landlordId },
      '[chatSocket] new_message emitted',
    );
  },

  emitSessionUpdated(
    tenantId: string,
    payload: SessionUpdatedEvent,
    landlordId?: string | null,
  ): void {
    const io = getIO();
    io.to(`user:${tenantId}`).emit('session_updated', payload);
    if (landlordId) {
      io.to(`landlord:${landlordId}`).emit('session_updated', payload);
    }
    io.to('provider:all').emit('session_updated', payload);

    logger.info(
      { tenantId, sessionId: payload.sessionId, status: payload.status, landlordId },
      '[chatSocket] session_updated emitted',
    );
  },
};
