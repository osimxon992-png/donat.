import express, { Router } from 'express';
import type { Container } from '../../container';
import { AppError, badRequest } from '../../lib/errors';
import { param } from '../../lib/validate';
import { WebhookVerificationError } from '../../modules/payments/payment-provider';

/** Mounted BEFORE the JSON body parser: signature verification needs the exact raw bytes. */
export function webhookRoutes(c: Container) {
  const r = Router();
  r.post('/payments/:provider', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const provider = param(req, 'provider');
    if (!/^[a-z0-9_-]{1,32}$/.test(provider)) throw badRequest('Invalid provider');
    if (!Buffer.isBuffer(req.body)) throw badRequest('Expected a raw body');
    try {
      const result = await c.payments.handleWebhook(provider, req.body, req.headers);
      res.json({ received: true, ...result });
    } catch (err) {
      if (err instanceof WebhookVerificationError) throw new AppError(400, 'INVALID_SIGNATURE', 'Webhook verification failed');
      throw err;
    }
  });
  return r;
}
