# Dynamic QR Subscription Setup

This phase adds backend-ready dynamic QR subscriptions to LaunchLab QR Studio.

Public static pages still work without setup. The paid dashboard and redirect engine require Cloudflare Pages Functions, a D1 database, secrets, and a PayPal webhook.

## Cloudflare bindings

Create a D1 database, then run `schema.sql` against it.

Bind the database to the Pages project:

- Binding name: `QR_DB`
- Type: D1 database

Add these environment variables/secrets to the Pages project:

- `SESSION_SECRET`: long random secret used to sign dashboard sessions
- `PAYPAL_ENV`: `live`
- `PAYPAL_CLIENT_ID`: PayPal app client ID
- `PAYPAL_CLIENT_SECRET`: PayPal app secret
- `PAYPAL_WEBHOOK_ID`: PayPal webhook ID after creating the webhook

## PayPal webhook

Create a PayPal webhook for the REST app that owns the subscription buttons.

Webhook URL:

```text
https://launchlab-qr-studio.arbietapel.workers.dev/api/paypal/webhook
```

Subscribe to these events:

- `BILLING.SUBSCRIPTION.CREATED`
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`

The current webhook handler stores subscription lifecycle events. Payment sale events can be used later for invoice/payment history.

## User flow

1. User subscribes from `pricing.html`.
2. PayPal activates the subscription.
3. PayPal sends a webhook to `/api/paypal/webhook`.
4. LaunchLab stores the subscription plan, status, subscriber email, and dynamic QR limit.
5. User opens `dashboard.html`.
6. User enters their PayPal subscriber email and subscription ID.
7. Dashboard receives a signed session token.
8. User creates dynamic QR redirects like `/r/fall-menu`.
9. Each scan logs a scan event and redirects to the current destination URL.

## Current plan limits

- Personal: 25 dynamic QR codes
- Standard: 100 dynamic QR codes
- Business: 300 dynamic QR codes
- Corporate: 1,000 dynamic QR codes

Static QR generation remains free and does not count toward plan limits.

## Important production notes

- Do not expose `PAYPAL_CLIENT_SECRET` in client-side JavaScript.
- The PayPal SDK client ID on `pricing.html` is public and safe to show.
- The webhook endpoint verifies PayPal signatures before writing subscription records.
- If `QR_DB`, `SESSION_SECRET`, or PayPal secrets are missing, the static pages still load but paid dashboard APIs will fail.
- When a custom domain is added, update this webhook URL, canonicals, `robots.txt`, `sitemap.xml`, and PayPal product URLs.
