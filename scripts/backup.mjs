import { createReadStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;

if (url) {
  console.error(
    'Hinweis: Turso-Datenbanken werden über die Turso CLI oder das Dashboard gesichert:\n' +
    '  turso db dump <datenbank-name> > backup.sql'
  );
  process.exit(1);
}

const rawPath = process.env.DATABASE_PATH ?? './data/zeitbuch.sqlite';
const filePath = rawPath.replace(/^file:/, '');

if (!existsSync(filePath)) {
  console.error(`Keine lokale Datenbank unter ${filePath} gefunden.`);
  process.exit(1);
}

await pipeline(createReadStream(filePath), process.stdout);
