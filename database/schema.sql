CREATE TABLE matters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slot INTEGER UNIQUE CHECK (slot BETWEEN 0 AND 4)
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES matters(id),
  started INTEGER NOT NULL,
  stopped INTEGER CHECK (stopped IS NULL OR stopped >= started),
  note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX one_open_entry ON entries ((1)) WHERE stopped IS NULL;
CREATE INDEX entries_started ON entries(started);
