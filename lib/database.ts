import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let connection: DatabaseSync | undefined;

export function transaction<T>(db: DatabaseSync, body: () => T, write = false): T {
  db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
  try {
    const result = body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function database(): DatabaseSync {
  if (connection) return connection;

  const path = resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? './data/zeitbuch.sqlite');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    transaction(db, () => {
      const version = db.prepare('PRAGMA user_version').get()?.user_version;
      if (version === 0) {
        db.exec(readFileSync(join(process.cwd(), 'database', 'schema.sql'), 'utf8'));
        db.exec('PRAGMA user_version = 1');
      } else if (version !== 1) {
        throw new Error('Die Datenbankversion wird von dieser Anwendung nicht unterstützt.');
      }
    }, true);
  } catch (error) {
    db.close();
    throw error;
  }

  connection = db;
  return db;
}
