import crypto from 'crypto';

/**
 * Verifica a assinatura HMAC-SHA256 enviada pela Meta no header
 * X-Hub-Signature-256 contra o corpo cru da requisição.
 *
 * Meta envia no formato: "sha256=<hex>". A verificação usa
 * timingSafeEqual para evitar timing attacks.
 */
export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signatureHeader) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = signatureHeader.slice('sha256='.length);

  if (expected.length !== received.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(received, 'hex'),
    );
  } catch {
    return false;
  }
}
