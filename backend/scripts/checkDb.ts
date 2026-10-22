import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/utils/prisma';

async function main() {
  const [productCount, storeCount, listingCount, historyCount] = await Promise.all([
    prisma.product.count(),
    prisma.store.count(),
    prisma.productStore.count(),
    prisma.priceHistory.count(),
  ]);

  console.log('\n--- SUPABASE DATABASE OVERVIEW ---');
  console.log(`Total Products: ${productCount}`);
  console.log(`Total Stores: ${storeCount}`);
  console.log(`Total ProductStore Listings: ${listingCount}`);
  console.log(`Total PriceHistory Entries: ${historyCount}`);

  const brandCounts = await prisma.product.groupBy({
    by: ['brand'],
    _count: { id: true },
  });
  console.log('\n--- PRODUCTS BY BRAND ---');
  for (const b of brandCounts) {
    console.log(`• ${b.brand}: ${b._count.id} products`);
  }

  const products = await prisma.product.findMany({
    take: 5,
    include: {
      bestStore: true,
      stores: true,
    },

    orderBy: { createdAt: 'desc' },
  });

  console.log('\n--- ALL XIAOMI / REDMI PRODUCTS IN DB ---');
  const xiaomiProds = await prisma.product.findMany({
    where: {
      OR: [
        { brand: { equals: 'Xiaomi', mode: 'insensitive' } },
        { brand: { equals: 'Redmi', mode: 'insensitive' } },
        { name: { contains: 'Redmi', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, brand: true, bestPrice: true },
    orderBy: { name: 'asc' },
  });
  console.log(`Found ${xiaomiProds.length} Xiaomi/Redmi products:`);
  for (const p of xiaomiProds) {
    console.log(`• [${p.brand}] ${p.name} - ₹${p.bestPrice}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
