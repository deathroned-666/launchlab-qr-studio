import { badRequest, getDb, isActiveStatus, json, normalizeEmail, randomId, signSession } from '../../_lib/shared.js';

export async function onRequestPost(context) {
  try {
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
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}
