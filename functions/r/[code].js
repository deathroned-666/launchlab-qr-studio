import { getDb, randomId } from '../_lib/shared.js';

export async function onRequestGet(context) {
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
