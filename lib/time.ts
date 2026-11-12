export const zone = 'Europe/Berlin';
const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function localTime(ms: number) {
  const fields = Object.fromEntries(formatter.formatToParts(ms).map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}`;
}

export function dayOf(ms: number) {
  return localTime(ms).slice(0, 10);
}

export function moveDay(day: string, offset: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function weekStart(day: string) {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return moveDay(day, -((weekday + 6) % 7));
}

export function parseLocal(value: string, original?: number) {
  const normalized = value.length === 16 ? value + ':00' : value;
  if (original !== undefined && localTime(original) === normalized) return original;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) return NaN;
  const utc = Date.parse(normalized + 'Z');
  if (!Number.isFinite(utc)) return NaN;
  for (const offset of [1, 2]) {
    const candidate = utc - offset * 3_600_000;
    if (localTime(candidate) === normalized) return candidate;
  }
  return NaN;
}

export function bounds(day: string) {
  return [parseLocal(day + 'T00:00:00'), parseLocal(moveDay(day, 1) + 'T00:00:00')];
}

export function duration(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function billingSteps(ms: number) {
  return Math.round(ms / 180_000);
}

export function billingHours(steps: number) {
  return (steps / 20).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
