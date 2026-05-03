import { DocumentType, RentalDocument } from '@prisma/client';
import prisma from '../config/db';
import { pushNotificationService } from './pushNotificationService';
import { logger } from '../config/logger';

// ---------------------------------------------------------------------------
// Rótulos legíveis para cada tipo de documento
// ---------------------------------------------------------------------------
const DOCUMENT_LABELS: Record<DocumentType, string> = {
  IDENTITY: 'Documento de Identidade',
  INCOME_PROOF: 'Comprovante de Renda',
  CONTRACT: 'Contrato',
};

// ---------------------------------------------------------------------------
// Serviço de Documentos de Locação
// ---------------------------------------------------------------------------
export const rentalDocumentService = {
  async getById(id: string): Promise<RentalDocument | null> {
    return prisma.rentalDocument.findUnique({ where: { id } });
  },

  async listByProcess(rentalProcessId: string): Promise<RentalDocument[]> {
    return prisma.rentalDocument.findMany({ where: { rentalProcessId } });
  },

  /**
   * Solicita um documento ao inquilino.
   * Persiste o registro de documento e notifica o inquilino.
   *
   * Gatilho: DOCUMENT_REQUESTED → inquilino
   */
  async requestDocument(
    rentalProcessId: string,
    documentType: DocumentType,
    fileUrl: string,
  ): Promise<RentalDocument> {
    // Busca o tenantId via processo de locação
    const process = await prisma.rentalProcess.findUnique({
      where: { id: rentalProcessId },
      include: { tenant: { select: { id: true, fcmToken: true } } },
    });

    if (!process) {
      throw new Error(`RentalProcess não encontrado: ${rentalProcessId}`);
    }

    const document = await prisma.rentalDocument.create({
      data: { rentalProcessId, documentType, fileUrl },
    });

    const docLabel = DOCUMENT_LABELS[documentType];

    // Notifica o inquilino sobre o documento solicitado
    pushNotificationService.notify({
      userId: process.tenant.id,
      fcmToken: process.tenant.fcmToken,
      type: 'DOCUMENT_REQUESTED',
      title: 'Documento Pendente',
      body: `Precisamos do seu ${docLabel} para continuar o processo de locação.`,
      data: {
        rentalProcessId,
        documentType,
        documentId: document.id,
        type: 'DOCUMENT_REQUESTED',
      },
    }).catch((err) =>
      logger.error(
        { err, rentalProcessId, documentType },
        '[rentalDocumentService] Falha ao notificar inquilino sobre DOCUMENT_REQUESTED',
      )
    );

    return document;
  },

  /**
   * Rejeita um documento enviado pelo inquilino e solicita reenvio.
   * Notifica o inquilino com o motivo da rejeição.
   *
   * Gatilho: DOCUMENT_REJECTED → inquilino
   */
  async rejectDocument(
    documentId: string,
    reason?: string,
  ): Promise<RentalDocument | null> {
    const document = await prisma.rentalDocument.findUnique({
      where: { id: documentId },
      include: {
        rentalProcess: {
          include: { tenant: { select: { id: true, fcmToken: true } } },
        },
      },
    });

    if (!document) return null;

    const docLabel = DOCUMENT_LABELS[document.documentType];
    const tenant = document.rentalProcess.tenant;
    const rejectionReason = reason ?? 'O documento está ilegível ou inválido.';

    // Notifica o inquilino sobre a rejeição
    pushNotificationService.notify({
      userId: tenant.id,
      fcmToken: tenant.fcmToken,
      type: 'DOCUMENT_REJECTED',
      title: 'Documento Rejeitado',
      body: `Seu ${docLabel} foi rejeitado. Motivo: ${rejectionReason} Por favor, reenvie.`,
      data: {
        rentalProcessId: document.rentalProcessId,
        documentType: document.documentType,
        documentId,
        type: 'DOCUMENT_REJECTED',
      },
    }).catch((err) =>
      logger.error(
        { err, documentId, documentType: document.documentType },
        '[rentalDocumentService] Falha ao notificar inquilino sobre DOCUMENT_REJECTED',
      )
    );

    return document;
  },
};
