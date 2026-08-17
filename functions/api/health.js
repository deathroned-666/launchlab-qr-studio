import { json } from '../_lib/shared.js';

export function onRequestGet(context) {
  return json({
    ok: true,
    hasDatabase: Boolean(context.env.QR_DB),
    hasSessionSecret: Boolean(context.env.SESSION_SECRET),
    hasPayPalWebhook: Boolean(context.env.PAYPAL_WEBHOOK_ID)
  });
}
