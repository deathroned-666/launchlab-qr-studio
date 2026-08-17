import {
  badRequest,
  getActiveSubscription,
  getDb,
  isActiveStatus,
  isUrl,
  json,
  normalizeEmail,
  randomId,
  requireSession,
  safeShortCode,
  signSession,
  PLAN_BY_ID
} from './functions/_lib/shared.js';
import { subscriptionFromWebhook, verifyPayPalWebhook } from './functions/_lib/paypal.js';

const SUBSCRIPTION_EVENTS = new Set([
  'BILLING.SUBSCRIPTION.CREATED',
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx, params: {} };

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') return handleHealth(context);
      if (request.method === 'GET' && url.pathname === '/api/plans') return handlePlans();
      if (request.method === 'POST' && url.pathname === '/api/paypal/webhook') return handlePayPalWebhook(context);
      if (request.method === 'POST' && url.pathname === '/api/subscription/claim') return handleClaim(context);
      if (url.pathname === '/api/qrs' && request.method === 'GET') return handleQrList(context);
      if (url.pathname === '/api/qrs' && request.method === 'POST') return handleQrCreate(context);

      const qrMatch = url.pathname.match(/^\/api\/qrs\/([^/]+)$/);
      if (qrMatch && request.method === 'PATCH') {
        context.params.id = qrMatch[1];
        return handleQrUpdate(context);
      }
      if (qrMatch && request.method === 'DELETE') {
        context.params.id = qrMatch[1];
        return handleQrDelete(context);
      }

      const redirectMatch = url.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
      if (redirectMatch && request.method === 'GET') {
        context.params.code = redirectMatch[1];
        return handleRedirect(context);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  }
};

function handleHealth(context) {
  return json({
    ok: true,
    hasDatabase: Boolean(context.env.QR_DB),
    hasSessionSecret: Boolean(context.env.SESSION_SECRET),
    hasPayPalWebhook: Boolean(context.env.PAYPAL_WEBHOOK_ID)
  });
}

function handlePlans() {
  const plans = Object.entries(PLAN_BY_ID).map(([planId, plan]) => ({
    planId,
    name: plan.name,
    dynamicQrLimit: plan.limit
  }));
  return json({ plans });
}

async function handlePayPalWebhook(context) {
  const rawBody = await context.request.text();
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
}

async function handleClaim(context) {
  const body = await context.request.json();
  const email = normalizeEmail(body.email);
  const subscriptionId = String(body.subscriptionId || '').trim();
  if (!email || !email.includes('@')) return badRequest('Enter the email used for the PayPal subscription.');
  if (!subscriptionId) return badRequest('Enter your PayPal subscription ID.');

  const db = getDb(context.env);
  const subscription = await db.prepare(
    'SELECT * FROM subscriptions WHERE subscription_id = ? LIMIT 1'
  ).bind(subscriptionId).first();

  if (!subscription) {
    return badRequest('Subscription not found yet. PayPal may need a few minutes to send the activation webhook.', 404);
  }
  if (!isActiveStatus(subscription.status)) {
    return badRequest(`This subscription is not active yet. Current status: ${subscription.status}.`, 403);
  }
  if (subscription.subscriber_email && subscription.subscriber_email !== email) {
    return badRequest('This email does not match the PayPal subscriber email.', 403);
  }

  let user = await db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(email).first();
  if (!user) {
    const userId = randomId('usr_');
    await db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(userId, email).run();
    user = { id: userId, email };
  }

  await db.prepare(
    `UPDATE subscriptions
     SET user_id = ?, subscriber_email = COALESCE(subscriber_email, ?), updated_at = CURRENT_TIMESTAMP
     WHERE subscription_id = ?`
  ).bind(user.id, email, subscriptionId).run();

  const token = await signSession(context.env, { userId: user.id, email: user.email });
  return json({
    token,
    user: { email: user.email },
    subscription: {
      id: subscription.subscription_id,
      planName: subscription.plan_name,
      status: subscription.status,
      dynamicQrLimit: subscription.qr_limit
    }
  });
}

async function handleQrList(context) {
  const session = await requireSession(context);
  if (!session) return badRequest('Sign in again.', 401);

  const db = getDb(context.env);
  const subscription = await getActiveSubscription(db, session.userId);
  if (!subscription) return badRequest('No active subscription found.', 403);

  const qrs = await db.prepare(
    `SELECT id, short_code, label, destination_url, scan_count, is_active, created_at, updated_at
     FROM dynamic_qrs
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).bind(session.userId).all();

  return json({
    subscription: {
      id: subscription.subscription_id,
      planName: subscription.plan_name,
      dynamicQrLimit: subscription.qr_limit
    },
    usage: {
      used: qrs.results.length,
      limit: subscription.qr_limit
    },
    qrs: qrs.results
  });
}

async function handleQrCreate(context) {
  const session = await requireSession(context);
  if (!session) return badRequest('Sign in again.', 401);

  const body = await context.request.json();
  const label = String(body.label || 'Untitled dynamic QR').trim().slice(0, 120);
  const destinationUrl = String(body.destinationUrl || '').trim();
  const requestedCode = safeShortCode(body.shortCode);
  if (!isUrl(destinationUrl)) return badRequest('Enter a valid http or https destination URL.');

  const db = getDb(context.env);
  const subscription = await getActiveSubscription(db, session.userId);
  if (!subscription) return badRequest('No active subscription found.', 403);

  const count = await db.prepare(
    'SELECT COUNT(*) AS total FROM dynamic_qrs WHERE user_id = ?'
  ).bind(session.userId).first();
  if (count.total >= subscription.qr_limit) {
    return badRequest(`Your ${subscription.plan_name} plan limit is ${subscription.qr_limit} dynamic QR codes.`, 403);
  }

  let shortCode = requestedCode || randomId('').slice(0, 8);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.prepare(
      'SELECT id FROM dynamic_qrs WHERE short_code = ? LIMIT 1'
    ).bind(shortCode).first();
    if (!existing) break;
    shortCode = randomId('').slice(0, 8);
  }

  const id = randomId('qr_');
  await db.prepare(
    `INSERT INTO dynamic_qrs (
      id, user_id, subscription_id, short_code, label, destination_url
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, session.userId, subscription.subscription_id, shortCode, label, destinationUrl).run();

  return json({
    qr: {
      id,
      shortCode,
      label,
      destinationUrl,
      redirectPath: `/r/${shortCode}`
    }
  }, 201);
}

async function handleQrUpdate(context) {
  const session = await requireSession(context);
  if (!session) return badRequest('Sign in again.', 401);

  const id = context.params.id;
  const body = await context.request.json();
  const label = String(body.label || '').trim().slice(0, 120);
  const destinationUrl = String(body.destinationUrl || '').trim();
  const isActive = body.isActive === undefined ? undefined : Boolean(body.isActive);
  if (destinationUrl && !isUrl(destinationUrl)) return badRequest('Enter a valid http or https destination URL.');

  const db = getDb(context.env);
  const qr = await db.prepare(
    'SELECT * FROM dynamic_qrs WHERE id = ? AND user_id = ? LIMIT 1'
  ).bind(id, session.userId).first();
  if (!qr) return badRequest('Dynamic QR not found.', 404);

  await db.prepare(
    `UPDATE dynamic_qrs
     SET label = COALESCE(NULLIF(?, ''), label),
         destination_url = COALESCE(NULLIF(?, ''), destination_url),
         is_active = COALESCE(?, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(
    label,
    destinationUrl,
    isActive === undefined ? null : Number(isActive),
    id,
    session.userId
  ).run();

  return json({ ok: true });
}

async function handleQrDelete(context) {
  const session = await requireSession(context);
  if (!session) return badRequest('Sign in again.', 401);

  const db = getDb(context.env);
  await db.prepare(
    'UPDATE dynamic_qrs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).bind(context.params.id, session.userId).run();

  return json({ ok: true });
}

async function handleRedirect(context) {
  const code = String(context.params.code || '').toLowerCase();
  const db = getDb(context.env);
  const qr = await db.prepare(
    'SELECT * FROM dynamic_qrs WHERE short_code = ? AND is_active = 1 LIMIT 1'
  ).bind(code).first();

  if (!qr) {
    return new Response('Dynamic QR code not found or inactive.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  const country = context.request.cf?.country || null;
  const userAgent = context.request.headers.get('user-agent') || null;
  const referer = context.request.headers.get('referer') || null;

  await db.batch([
    db.prepare('UPDATE dynamic_qrs SET scan_count = scan_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(qr.id),
    db.prepare('INSERT INTO scan_events (id, qr_id, country, user_agent, referer) VALUES (?, ?, ?, ?, ?)').bind(
      randomId('scan_'),
      qr.id,
      country,
      userAgent,
      referer
    )
  ]);

  return Response.redirect(qr.destination_url, 302);
}
