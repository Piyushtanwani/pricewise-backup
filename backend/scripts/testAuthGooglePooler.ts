import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '../src/generated/prisma';

async function testAll() {
  const url = (process.env.DATABASE_URL || '').replace(':5432', ':6543').replace(/\?.*$/, '') + '?pgbouncer=true&connection_limit=10';
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    console.log('Testing user.findFirst...');
    const user = await prisma.user.findFirst({
      select: { id: true, email: true, name: true }
    });
    console.log('User found:', user?.email);

    console.log('Testing product.findMany...');
    const prods = await prisma.product.findMany({
      take: 2,
      select: { id: true, name: true, bestPrice: true }
    });
    console.log('Products found:', prods.length);

    console.log('All DB operations succeeded smoothly!');
  } catch (err: any) {
    console.error('Test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testAll();
