import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './database';
import { bounds, dayOf } from './time';
import type { Entry, Matter } from './model';

const reply = (error: string, status = 400) => Response.json({ error }, { status });

export async function readDay(request: Request, db: DatabaseSync) {
  const day = new URL(request.url).searchParams.get('day') ?? dayOf(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) {
    return reply('Ungültiges Datum.');
  }
  const [from, until] = bounds(day);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return reply('Ungültiges Datum.');
  const [matters, entries, active] = transaction(db, () => [
    db.prepare('SELECT * FROM matters ORDER BY slot IS NULL, slot, name').all() as Matter[],
    db.prepare('SELECT * FROM entries WHERE started < ? AND (stopped > ? OR stopped IS NULL) ORDER BY started DESC').all(until, from) as Entry[],
    db.prepare('SELECT * FROM entries WHERE stopped IS NULL').get() as Entry | undefined,
  ] as const);
  return Response.json({
    matters,
    entries,
    active: active ?? null,
    now: Date.now(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

const overlap = 'NOT EXISTS (SELECT 1 FROM entries other WHERE other.id <> ? AND other.started < ? AND (other.stopped IS NULL OR other.stopped > ?))';

export async function saveChange(request: Request, db: DatabaseSync) {
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
  let changed: number | bigint;

  switch (action) {
    case 'assign': {
      const slot = body.slot;
      if (!newId || !Number.isInteger(slot) || slot < 0 || slot > 4 || !name || name.length > 80) {
        return reply('Bitte gib ein Aktenzeichen oder einen Namen ein.');
      }
      if (expected !== undefined && typeof expected !== 'string') return reply('Ungültiger Mandant.');
      changed = transaction(db, () => {
        db.prepare('UPDATE matters SET slot = NULL WHERE slot = ? AND id = ? AND NOT EXISTS (SELECT 1 FROM entries WHERE matter_id = ? AND stopped IS NULL)')
          .run(slot, expected ?? '', expected ?? '');
        return db.prepare('INSERT OR IGNORE INTO matters (id, name, slot) VALUES (?, ?, ?)')
          .run(newId, name, slot).changes;
      }, true);
      break;
    }
    case 'rename': {
      if (!newId || !name || name.length > 80) return reply('Bitte gib einen gültigen Namen ein.');
      changed = db.prepare('UPDATE matters SET name = ? WHERE id = ?').run(name, newId).changes;
      break;
    }
    case 'stop': {
      if (!newId) return reply('Ungültiger Zeiteintrag.');
      changed = db.prepare('UPDATE entries SET stopped = ? WHERE id = ? AND stopped IS NULL AND started <= ?').run(now, newId, now).changes;
      break;
    }
    case 'start': {
      if (!newId || typeof matter !== 'string' || (expected !== undefined && typeof expected !== 'string')) {
        return reply('Ungültiger Mandant.');
      }
      const insert = db.prepare(`INSERT OR IGNORE INTO entries (id, matter_id, started)
        SELECT ?, id, ? FROM matters WHERE id = ? AND slot IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM entries WHERE stopped IS NULL)`);
      if (typeof expected === 'string' && expected) {
        changed = transaction(db, () => {
          const stopped = db.prepare(`UPDATE entries SET stopped = ? WHERE id = ? AND stopped IS NULL
            AND started <= ? AND matter_id <> ? AND EXISTS (SELECT 1 FROM matters WHERE id = ? AND slot IS NOT NULL)`)
            .run(now, expected, now, matter, matter);
          return stopped.changes ? insert.run(newId, now, matter).changes : 0;
        }, true);
      } else {
        changed = insert.run(newId, now, matter).changes;
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
      changed = body.edit
        ? db.prepare(`UPDATE entries SET started = ?, stopped = ?, note = ?
            WHERE id = ? AND matter_id = ? AND stopped IS NOT NULL AND ${overlap}`)
            .run(started, stopped, note, newId, matter, newId, stopped, started).changes
        : db.prepare(`INSERT OR IGNORE INTO entries (id, matter_id, started, stopped, note)
            SELECT ?, id, ?, ?, ? FROM matters WHERE id = ? AND ${overlap}`)
            .run(newId, started, stopped, note, matter, newId, stopped, started).changes;
      break;
    }
    case 'delete': {
      if (!newId) return reply('Ungültiger Zeiteintrag.');
      changed = db.prepare('DELETE FROM entries WHERE id = ? AND stopped IS NOT NULL').run(newId).changes;
      break;
    }
    default:
      return reply('Unbekannte Aktion.');
  }
  return changed ? Response.json({ ok: true }) : reply(conflict, 409);
}
