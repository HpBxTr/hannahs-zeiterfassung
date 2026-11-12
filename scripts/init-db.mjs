import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

async function init() {
  const schema = readFileSync(join(process.cwd(), 'database', 'schema.sql'), 'utf8');

  if (url) {
    console.log(`Verbinde mit Turso-Datenbank (${url})...`);
    const client = createClient({ url, authToken });
    try {
      await client.executeMultiple(schema);
      console.log('Turso-Datenbank erfolgreich initialisiert.');
    } finally {
      client.close();
    }
  } else {
    const rawPath = process.env.DATABASE_PATH ?? './data/zeitbuch.sqlite';
    const filePath = rawPath.replace(/^file:/, '');
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const fileUrl = rawPath.startsWith('file:') ? rawPath : `file:${rawPath}`;
    console.log(`Initialisiere lokale SQLite-Datenbank unter ${fileUrl}...`);
    const client = createClient({ url: fileUrl });
    try {
      await client.executeMultiple(schema);
      console.log('Lokale SQLite-Datenbank erfolgreich initialisiert.');
    } finally {
      client.close();
    }
  }
}

init().catch((err) => {
  console.error('Fehler bei der Datenbank-Initialisierung:', err);
  // Bei Vercel-Build ohne gesetzte Turso-URL nicht fehlschlagen, damit der Build durchläuft
  if (!url) {
    console.warn('Hinweis: Weder TURSO_DATABASE_URL noch lokale DB konfiguriert.');
  } else {
    process.exit(1);
  }
});
