/**
 * Ambient Express type augmentations that don't belong to any single
 * middleware's runtime module, or that need to be visible to a tsconfig/jest
 * project that doesn't happen to include the middleware file that sets the
 * property.
 *
 * `rawBody`: raw request body bytes, captured by the `verify` callback on
 * the JSON parser in `middleware/rawBody.ts` (scoped to the email-delivery
 * webhook route only - see that file for why this isn't the global
 * `express.json()` in `server.ts`). Consumed by
 * `emailLogController.handleDeliveryWebhook` to HMAC-verify the inbound
 * webhook against the exact bytes the sender signed.
 */
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;

      /**
       * Set by `allowAdmin` when an instance admin was let past a guard that
       * would otherwise have rejected them. Handlers read it to record the
       * privileged access - in a signing product a cross-tenant read of the
       * audit trail is exactly the access the trail should show.
       */
      usedAdminBypass?: boolean;
    }
  }
}

export {};
