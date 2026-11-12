import { database } from '../../../lib/database';
import { readDay, saveChange } from '../../../lib/zeitbuch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return await readDay(request, database());
}

export async function POST(request: Request) {
  return await saveChange(request, database());
}
