# LaunchLab QR Studio

A static, Cloudflare Pages-ready utility website for creating free static QR codes as part of the LaunchLab project.

## Best idea

Build around the positioning: **free static QR codes that never expire**.

This is the strongest starting niche because QR-code search demand is high, the tool can run as a static site, and the site can grow through long-tail pages like Wi-Fi QR code generator, vCard QR code generator, QR code with logo, bulk QR code generator, and QR code size guide.

## Cloudflare Pages hosting

Fastest launch path:

1. Sign in to Cloudflare.
2. Open **Workers & Pages**.
3. Choose **Create application**.
4. Choose **Pages**.
5. Select **Upload assets**.
6. Upload the contents of this `qr-code-studio` folder.
7. Deploy.

Git-based path:

1. Create a GitHub repository.
2. Put these files at the repository root.
3. In Cloudflare Pages, connect the repository.
4. Use no build command.
5. Use `/` as the output directory.
6. Deploy.

## Dynamic QR subscriptions

The project now includes Cloudflare Pages Functions for paid dynamic QR management:

- PayPal subscription webhook: `/api/paypal/webhook`
- Subscriber claim API: `/api/subscription/claim`
- Dynamic QR API: `/api/qrs`
- Redirect route: `/r/{code}`
- Subscriber dashboard: `dashboard.html`

See `dynamic-qr-setup.md` before turning the dashboard on for customers. It requires a Cloudflare D1 binding named `QR_DB`, a `SESSION_SECRET`, and PayPal REST app webhook credentials.

## Before applying for AdSense

- Confirm the public contact details in `contact.html` are still current.
- Add more original support pages, especially:
  - Wi-Fi QR Code Generator
  - vCard QR Code Generator
  - QR Code With Logo
  - Bulk QR Code Generator
  - QR Code Size Guide
  - Why Is My QR Code Not Scanning?
- Avoid placing ads too close to buttons, downloads, tabs, or the QR preview.
- Make sure the site has Privacy, About, and Contact pages linked from every page.
