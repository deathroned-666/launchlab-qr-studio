# Early Subscriber Operations

Use this checklist while LaunchLab QR Studio is in early dynamic QR rollout.

## If a subscriber cannot unlock the dashboard

1. Ask for the PayPal subscriber email and PayPal subscription ID.
2. In Cloudflare D1, check whether the subscription exists:

```sql
SELECT subscription_id, subscriber_email, plan_name, status, qr_limit, updated_at
FROM subscriptions
WHERE subscription_id = 'SUBSCRIPTION_ID_HERE';
```

3. If no row appears, PayPal has not delivered the webhook yet or the webhook failed.
4. If the subscription is legitimate and you need to unlock access manually, insert or update the row:

```sql
INSERT OR REPLACE INTO subscriptions (
  subscription_id,
  subscriber_email,
  plan_id,
  plan_name,
  status,
  qr_limit,
  paypal_payload,
  updated_at
) VALUES (
  'SUBSCRIPTION_ID_HERE',
  'subscriber@example.com',
  'P-4VK74641CF049613NNKBXX5Q',
  'Personal',
  'ACTIVE',
  25,
  '{"manual":true}',
  CURRENT_TIMESTAMP
);
```

Use the correct plan values:

- Personal: `P-4VK74641CF049613NNKBXX5Q`, limit `25`
- Standard: `P-3XX127125D482264LNKBXYRQ`, limit `100`
- Business: `P-6DG65191VW6148735NKBXZCA`, limit `300`
- Corporate: `P-3WD55804J4015973VNKBXZOI`, limit `1000`

5. Ask the subscriber to open `dashboard.html`, enter the same email and subscription ID, then unlock access.

## Manual test subscription

Keep this row only for internal testing:

```sql
INSERT OR REPLACE INTO subscriptions (
  subscription_id,
  subscriber_email,
  plan_id,
  plan_name,
  status,
  qr_limit,
  paypal_payload,
  updated_at
) VALUES (
  'TEST-SUBSCRIPTION-001',
  'launchlab9@gmail.com',
  'P-4VK74641CF049613NNKBXX5Q',
  'Personal',
  'ACTIVE',
  25,
  '{"test":true}',
  CURRENT_TIMESTAMP
);
```
