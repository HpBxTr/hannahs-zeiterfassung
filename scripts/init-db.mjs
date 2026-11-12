import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
const dbPath = resolve(
  path.join(process.cwd(), process.env.DATABASE_PATH) ??
    path.join(process.cwd(), "./data/zeitbuch.sqlite"),
);
if (!existsSync(dbPath)) {
  console.log(`Erstelle SQLite-Datenbank unter ${dbPath}...`);
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(
      "PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;",
    );
    const schema = readFileSync(
      join(process.cwd(), "database", "schema.sql"),
      "utf8",
    );
    db.exec(schema);
    db.exec("PRAGMA user_version = 1;");
    console.log("SQLite-Datenbank erfolgreich initialisiert.");
  } finally {
    db.close();
  }
} else {
  console.log(`SQLite-Datenbank existiert bereits unter ${dbPath}.`);
}
