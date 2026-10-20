import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/utils/prisma';

async function checkMrpExceed() {
  const records = await prisma.priceHistory.findMany({
    where: {
      productStore: {
        product: {
          mrp: { not: null }
        }
      }
    },
    include: {
      productStore: {
        include: {
          product: { select: { id: true, name: true, mrp: true } },
          store: { select: { name: true } }
        }
      }
    }
  });

  const exceeding = records.filter(r => r.productStore.product.mrp && r.price > r.productStore.product.mrp);
  console.log(`Total records checked: ${records.length}`);
  console.log(`Exceeding MRP records: ${exceeding.length}`);

  const sample = exceeding.slice(0, 10).map(r => ({
    product: r.productStore.product.name,
    mrp: r.productStore.product.mrp,
    historyPrice: r.price,
    ratio: (r.price / r.productStore.product.mrp!).toFixed(2),
    store: r.productStore.store.name,
    timestamp: r.timestamp.toISOString()
  }));

  console.log('Sample exceeding records:', JSON.stringify(sample, null, 2));

  // Also check if any product has negative prices or massive spikes
  let priceSpikes = 0;
  // group by productStoreId
  const byStore = new Map<string, typeof records>();
  for (const r of records) {
    if (!byStore.has(r.productStoreId)) byStore.set(r.productStoreId, []);
    byStore.get(r.productStoreId)!.push(r);
  }

  for (const [psId, list] of byStore.entries()) {
    list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    for (let i = 1; i < list.length; i++) {
      const prev = list[i-1].price;
      const curr = list[i].price;
      if (curr > prev * 2 || curr < prev * 0.5) {
        priceSpikes++;
      }
    }
  }

  console.log(`Instances of 2x price spikes / 50% crashes day-over-day: ${priceSpikes}`);
}

checkMrpExceed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
