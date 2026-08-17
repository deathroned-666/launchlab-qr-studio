import { badRequest, getDb, json } from '../../_lib/shared.js';
import { subscriptionFromWebhook, verifyPayPalWebhook } from '../../_lib/paypal.js';

const SUBSCRIPTION_EVENTS = new Set([
  'BILLING.SUBSCRIPTION.CREATED',
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
]);

export async function onRequestPost(context) {
  let rawBody = '';
  try {
    rawBody = await context.request.text();
    const event = JSON.parse(rawBody);

    const verified = await verifyPayPalWebhook(context.env, context.request.headers, rawBody, event);
    if (!verified) return badRequest('Webhook verification failed', 401);

    if (!SUBSCRIPTION_EVENTS.has(event.event_type)) {
      return json({ ok: true, ignored: event.event_type });
    }

    const subscription = subscriptionFromWebhook(event);
    if (!subscription.subscriptionId || !subscription.planId || !subscription.qrLimit) {
      return badRequest('Unsupported subscription payload');
    }

    const db = getDb(context.env);
    await db.prepare(
      `INSERT INTO subscriptions (
        subscription_id, subscriber_email, plan_id, plan_name, status, qr_limit, paypal_payload, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(subscription_id) DO UPDATE SET
        subscriber_email = COALESCE(excluded.subscriber_email, subscriptions.subscriber_email),
        plan_id = excluded.plan_id,
        plan_name = excluded.plan_name,
        status = excluded.status,
        qr_limit = excluded.qr_limit,
        paypal_payload = excluded.paypal_payload,
        updated_at = CURRENT_TIMESTAMP`
    ).bind(
      subscription.subscriptionId,
      subscription.subscriberEmail || null,
      subscription.planId,
      subscription.planName,
      subscription.status,
      subscription.qrLimit,
      rawBody
    ).run();

    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message, received: Boolean(rawBody) }, 500);
  }
}
