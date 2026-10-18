import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/utils/prisma';

async function checkNature() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      stores: {
        select: {
          id: true,
          store: { select: { name: true } },
          productUrl: true,
          priceHistory: {
            take: 3,
            select: { price: true, timestamp: true }
          },
          _count: { select: { priceHistory: true } }
        }
      }
    }
  });

  let smartprixProducts = 0;
  let seedOnlyProducts = 0;

  for (const p of products) {
    const isSmartprix = p.stores.some(s => s.productUrl.includes('smartprix.com') || s.productUrl.includes('linkredirect.in'));
    if (isSmartprix) {
      smartprixProducts++;
    } else {
      seedOnlyProducts++;
    }
  }

  console.log(`Products sourced from Smartprix price-tracker: ${smartprixProducts}`);
  console.log(`Products sourced from initial seed template: ${seedOnlyProducts}`);

  // Inspect first 3 price history points of a Smartprix product
  const spSample = products.find(p => p.stores.some(s => s.productUrl.includes('smartprix')));
  if (spSample) {
    console.log(`Sample Smartprix product: "${spSample.name}"`);
    for (const s of spSample.stores) {
      console.log(` Store: ${s.store.name}, Total History Rows: ${s._count.priceHistory}`);
      console.log(` First points:`, s.priceHistory);
    }
  }
}

checkNature()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
