import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/utils/prisma';

async function checkOrigin() {
  // Check Product URLs, externalId, and timestamp characteristics
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      createdAt: true,
      stores: {
        select: {
          id: true,
          store: { select: { name: true, slug: true } },
          externalId: true,
          productUrl: true,
          priceHistory: {
            take: 5,
            select: { price: true, timestamp: true }
          }
        }
      }
    }
  });

  let smartprixUrlCount = 0;
  let searchUrlCount = 0;
  let midnightTimestampCount = 0;
  let nonMidnightTimestampCount = 0;

  for (const p of products) {
    for (const s of p.stores) {
      if (s.productUrl.includes('smartprix.com')) {
        smartprixUrlCount++;
      } else if (s.productUrl.includes('search') || s.productUrl.includes('/s?k=')) {
        searchUrlCount++;
      }

      for (const ph of s.priceHistory) {
        const timePart = ph.timestamp.toISOString().split('T')[1];
        if (timePart === '00:00:00.000Z') {
          midnightTimestampCount++;
        } else {
          nonMidnightTimestampCount++;
        }
      }
    }
  }

  console.log(`Stores with Smartprix links: ${smartprixUrlCount}`);
  console.log(`Stores with Search/Seed links: ${searchUrlCount}`);
  console.log(`PriceHistory rows with exact 00:00:00.000Z timestamp: ${midnightTimestampCount}`);
  console.log(`PriceHistory rows with non-midnight timestamp: ${nonMidnightTimestampCount}`);

  // Check product names - are they the 10 seed products or the 91 mobile catalog?
  const seedNames = [
    'WH-1000XM5',
    'iPhone 16 Pro Max 256GB Natural Titanium',
    'Galaxy S25 Ultra 512GB Titanium Black',
    'MacBook Pro 14" M4 Pro',
    'iPad Pro 11" M4 256GB'
  ];

  const matchingSeed = products.filter(p => seedNames.some(sn => p.name.includes(sn)));
  console.log(`Original seed mock products present: ${matchingSeed.length}`);
  console.log(`Full catalog products present: ${products.length}`);
}

checkOrigin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
