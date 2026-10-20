import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '../src/generated/prisma';

async function testUrl(url: string, label: string) {
  console.log(`\nTesting [${label}]...`);
  const client = new PrismaClient({
    datasources: { db: { url } },
  });
  try {
    const count = await client.user.count();
    console.log(`=> SUCCESS on [${label}]: found ${count} users!`);
    await client.$disconnect();
    return true;
  } catch (err: any) {
    console.error(`=> FAILED on [${label}]:`, err.message);
    await client.$disconnect().catch(() => {});
    return false;
  }
}

async function main() {
  const current = process.env.DATABASE_URL || '';
  console.log('Current URL port:', current.match(/:(\d+)\//)?.[1]);

  // Option A: Current port 5432 with ?connection_limit=3
  const optA = current.replace(/\?.*$/, '') + '?connection_limit=3';
  await testUrl(optA, 'Port 5432 with connection_limit=3');

  // Option B: Port 6543 (transaction mode pooler) with ?pgbouncer=true&connection_limit=5
  const optB = current.replace(':5432', ':6543').replace(/\?.*$/, '') + '?pgbouncer=true&connection_limit=5';
  await testUrl(optB, 'Port 6543 with pgbouncer=true&connection_limit=5');
}

main().catch(console.error);
