import {
  badRequest,
  getActiveSubscription,
  getDb,
  isUrl,
  json,
  randomId,
  requireSession,
  safeShortCode
} from '../../_lib/shared.js';

export async function onRequestGet(context) {
  try {
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
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
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
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}
