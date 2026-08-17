import { badRequest, getDb, isUrl, json, requireSession } from '../../_lib/shared.js';

export async function onRequestPatch(context) {
  try {
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
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const session = await requireSession(context);
    if (!session) return badRequest('Sign in again.', 401);

    const db = getDb(context.env);
    await db.prepare(
      'UPDATE dynamic_qrs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    ).bind(context.params.id, session.userId).run();

    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}
