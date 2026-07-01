#!/usr/bin/env node
import { createDb } from '@sniffoutpro/db';
import { scanRuns } from '@sniffoutpro/db/schema';

const url = process.env.DATABASE_URL;
if (!url?.trim()) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const db = createDb(url);
try {
  const rows = await db.select({ id: scanRuns.id }).from(scanRuns).limit(1);
  console.log('ok', rows.length, 'rows');
} catch (err) {
  console.error('fail', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await db.close();
}
