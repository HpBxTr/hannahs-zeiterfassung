import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { backup, DatabaseSync } from 'node:sqlite';

const directory = await mkdtemp(join(tmpdir(), 'zeitbuch-'));
try {
  const copy = join(directory, 'backup.sqlite');
  const db = new DatabaseSync(resolve(process.env.DATABASE_PATH ?? './data/zeitbuch.sqlite'), { readOnly: true });
  try {
    await backup(db, copy);
  } finally {
    db.close();
  }
  await pipeline(createReadStream(copy), process.stdout);
} finally {
  await rm(directory, { recursive: true, force: true });
}
