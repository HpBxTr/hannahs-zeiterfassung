export type Matter = { id: string; name: string; slot: number | null };
export type Entry = { id: string; matter_id: string; started: number; stopped: number | null; note: string };
export type Snapshot = { matters: Matter[]; entries: Entry[]; active: Entry | null; now: number };
