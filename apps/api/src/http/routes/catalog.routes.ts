import { validatePlayerSchema } from '@donat/shared';
import { Router } from 'express';
import type { Container } from '../../container';
import { param, parse, str } from '../../lib/validate';
import { rateLimit } from '../rate-limit';

export function catalogRoutes(c: Container) {
  const r = Router();
  const validateLimiter = rateLimit({ store: c.rateLimitStore, windowMs: 60_000, max: 30, prefix: 'validate' });

  r.get('/games', async (req, res) => {
    res.json({ games: await c.catalog.listGames(str(req.query.q)?.slice(0, 50)) });
  });

  r.get('/games/:slug', async (req, res) => {
    res.json({ game: await c.catalog.getGame(param(req, 'slug')) });
  });

  r.post('/games/:slug/validate-player', validateLimiter, async (req, res) => {
    const input = parse(validatePlayerSchema, req.body);
    res.json(await c.checkout.validatePlayer(param(req, 'slug'), input.playerId, input.serverId));
  });

  r.get('/payment-methods', (_req, res) => {
    res.json({
      methods: c.paymentRegistry.list(),
      realPaymentsEnabled: c.env.ENABLE_REAL_PAYMENTS,
      realFulfillmentEnabled: c.env.ENABLE_REAL_FULFILLMENT,
    });
  });

  return r;
}
