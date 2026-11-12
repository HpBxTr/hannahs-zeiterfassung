import { database } from '../../../lib/database';
import { readDay, saveChange } from '../../../lib/zeitbuch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  return readDay(request, database());
}

export function POST(request: Request) {
  return saveChange(request, database());
}
