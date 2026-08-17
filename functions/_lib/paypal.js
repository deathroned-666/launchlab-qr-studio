import { toPlan } from './shared.js';

function paypalApiBase(env) {
  return env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

export async function getPayPalAccessToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
  }
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${paypalApiBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) throw new Error('PayPal access token request failed');
  const data = await response.json();
  return data.access_token;
}

export async function verifyPayPalWebhook(env, headers, rawBody, event) {
  if (!env.PAYPAL_WEBHOOK_ID) throw new Error('Missing PAYPAL_WEBHOOK_ID');
  const accessToken = await getPayPalAccessToken(env);
  const response = await fetch(`${paypalApiBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event || JSON.parse(rawBody)
    })
  });
  if (!response.ok) throw new Error('PayPal webhook verification request failed');
  const result = await response.json();
  return result.verification_status === 'SUCCESS';
}

export function subscriptionFromWebhook(event) {
  const resource = event.resource || {};
  const planId = resource.plan_id || resource.plan?.id || '';
  const plan = toPlan(planId);
  const subscriber = resource.subscriber || {};
  return {
    eventType: event.event_type || '',
    subscriptionId: resource.id || resource.billing_agreement_id || '',
    planId,
    planName: plan.name,
    qrLimit: plan.limit,
    status: String(resource.status || '').toUpperCase(),
    subscriberEmail: String(subscriber.email_address || resource.subscriber_email || '').toLowerCase()
  };
}
