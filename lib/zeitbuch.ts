import type { Client } from '@libsql/client';
import { bounds, dayOf } from './time';
import type { Entry, Matter } from './model';

const reply = (error: string, status = 400) => Response.json({ error }, { status });

export async function readDay(request: Request, db: Client) {
  const day = new URL(request.url).searchParams.get('day') ?? dayOf(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) {
    return reply('Ungültiges Datum.');
  }
  const [from, until] = bounds(day);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return reply('Ungültiges Datum.');

  const [mattersRes, entriesRes, activeRes] = await db.batch([
    'SELECT * FROM matters ORDER BY slot IS NULL, slot, name',
    {
      sql: 'SELECT * FROM entries WHERE started < ? AND (stopped > ? OR stopped IS NULL) ORDER BY started DESC',
      args: [until, from],
    },
    'SELECT * FROM entries WHERE stopped IS NULL',
  ], 'read');

  const matters = mattersRes.rows as unknown as Matter[];
  const entries = entriesRes.rows as unknown as Entry[];
  const active = (activeRes.rows[0] as unknown as Entry) ?? null;

  return Response.json({
    matters,
    entries,
    active,
    now: Date.now(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

const overlap = 'NOT EXISTS (SELECT 1 FROM entries other WHERE other.id <> ? AND other.started < ? AND (other.stopped IS NULL OR other.stopped > ?))';

export async function saveChange(request: Request, db: Client) {
  if (request.headers.get('sec-fetch-site') === 'cross-site' ||
      !request.headers.get('content-type')?.startsWith('application/json')) {
    return reply('Ungültige Anfrage.', 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return reply('Ungültige Anfrage.');
  const now = Date.now();
  const { action, id, matter, expected } = body;
  const newId = typeof id === 'string' && /^[\da-f-]{36}$/i.test(id) ? id : null;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const conflict = 'Der Stand hat sich geändert oder die Zeit überschneidet sich. Bitte prüfe die Einträge.';
  let changed = 0;

  switch (action) {
    case 'assign': {
      const slot = body.slot;
      if (!newId || !Number.isInteger(slot) || slot < 0 || slot > 4 || !name || name.length > 80) {
        return reply('Bitte gib ein Aktenzeichen oder einen Namen ein.');
      }
      if (expected !== undefined && typeof expected !== 'string') return reply('Ungültiger Mandant.');
      const [, insertRes] = await db.batch([
        {
          sql: 'UPDATE matters SET slot = NULL WHERE slot = ? AND id = ? AND NOT EXISTS (SELECT 1 FROM entries WHERE matter_id = ? AND stopped IS NULL)',
          args: [slot, expected ?? '', expected ?? ''],
        },
        {
          sql: 'INSERT OR IGNORE INTO matters (id, name, slot) VALUES (?, ?, ?)',
          args: [newId, name, slot],
        },
      ], 'write');
      changed = Number(insertRes.rowsAffected);
      break;
    }
    case 'rename': {
      if (!newId || !name || name.length > 80) return reply('Bitte gib einen gültigen Namen ein.');
      const res = await db.execute({
        sql: 'UPDATE matters SET name = ? WHERE id = ?',
        args: [name, newId],
      });
      changed = Number(res.rowsAffected);
      break;
    }
    case 'stop': {
      if (!newId) return reply('Ungültiger Zeiteintrag.');
      const res = await db.execute({
        sql: 'UPDATE entries SET stopped = ? WHERE id = ? AND stopped IS NULL AND started <= ?',
        args: [now, newId, now],
      });
      changed = Number(res.rowsAffected);
      break;
    }
    case 'start': {
      if (!newId || typeof matter !== 'string' || (expected !== undefined && typeof expected !== 'string')) {
        return reply('Ungültiger Mandant.');
      }
      const insertSql = `INSERT OR IGNORE INTO entries (id, matter_id, started)
        SELECT ?, id, ? FROM matters WHERE id = ? AND slot IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM entries WHERE stopped IS NULL)`;
      if (typeof expected === 'string' && expected) {
        const tx = await db.transaction('write');
        try {
          const stopped = await tx.execute({
            sql: `UPDATE entries SET stopped = ? WHERE id = ? AND stopped IS NULL
              AND started <= ? AND matter_id <> ? AND EXISTS (SELECT 1 FROM matters WHERE id = ? AND slot IS NOT NULL)`,
            args: [now, expected, now, matter, matter],
          });
          if (stopped.rowsAffected > 0) {
            const insert = await tx.execute({
              sql: insertSql,
              args: [newId, now, matter],
            });
            changed = Number(insert.rowsAffected);
            await tx.commit();
          } else {
            changed = 0;
            await tx.rollback();
          }
        } catch (e) {
          await tx.rollback();
          throw e;
        }
      } else {
        const insert = await db.execute({
          sql: insertSql,
          args: [newId, now, matter],
        });
        changed = Number(insert.rowsAffected);
      }
      break;
    }
    case 'entry': {
      const { started, stopped } = body;
      if (!newId || typeof matter !== 'string') return reply('Ungültiger Zeiteintrag.');
      if (!Number.isSafeInteger(started) || !Number.isSafeInteger(stopped)) {
        return reply('Bitte gib ein gültiges Datum und eine gültige Uhrzeit für Beginn und Ende ein.');
      }
      if (started >= stopped) return reply('Das Ende muss nach dem Beginn liegen.');
      if (stopped > now) return reply('Die Endzeit liegt in der Zukunft. Bitte prüfe Datum und Uhrzeit.');
      if (note.length > 250) return reply('Die Tätigkeitsbeschreibung darf höchstens 250 Zeichen lang sein.');
      const res = await db.execute({
        sql: body.edit
          ? `UPDATE entries SET started = ?, stopped = ?, note = ?
             WHERE id = ? AND matter_id = ? AND stopped IS NOT NULL AND ${overlap}`
          : `INSERT OR IGNORE INTO entries (id, matter_id, started, stopped, note)
             SELECT ?, id, ?, ?, ? FROM matters WHERE id = ? AND ${overlap}`,
        args: body.edit
          ? [started, stopped, note, newId, matter, newId, stopped, started]
          : [newId, started, stopped, note, matter, newId, stopped, started],
      });
      changed = Number(res.rowsAffected);
      break;
    }
    case 'delete': {
      if (!newId) return reply('Ungültiger Zeiteintrag.');
      const res = await db.execute({
        sql: 'DELETE FROM entries WHERE id = ? AND stopped IS NOT NULL',
        args: [newId],
      });
      changed = Number(res.rowsAffected);
      break;
    }
    default:
      return reply('Unbekannte Aktion.');
  }
  return changed ? Response.json({ ok: true }) : reply(conflict, 409);
}
