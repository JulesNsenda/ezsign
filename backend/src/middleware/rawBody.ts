import express, { Request, Response } from 'express';

/**
 * G6: a narrow JSON body parser mounted only on the inbound email-delivery
 * webhook route (`/api/webhooks/email-status`), ahead of the global
 * `express.json()` in `server.ts`.
 *
 * The `verify` callback captures the raw request bytes onto `req.rawBody`
 * (type declared in `types/express.d.ts`) so
 * `emailLogController.handleDeliveryWebhook` can HMAC-verify the payload
 * against the exact bytes the sender signed - a re-serialized
 * `JSON.stringify(req.body)` is not guaranteed to match.
 *
 * Deliberately not the global parser: that one accepts bodies up to 50mb
 * (`submitSignature` routinely carries multi-MB base64 signature payloads),
 * and pinning the raw `Buffer` onto every JSON request for that entire limit
 * roughly doubles peak memory - for a route (the webhook) that receives no
 * comparable traffic and needs nothing close to 50mb. A small, dedicated
 * limit here keeps that cost scoped to where it's actually needed.
 */
export const rawBodyJsonParser = express.json({
  limit: '100kb',
  verify: (req: Request, _res: Response, buf: Buffer) => {
    req.rawBody = buf;
  },
});
