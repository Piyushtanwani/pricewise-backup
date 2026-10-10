import 'dotenv/config';
import prisma from '../src/utils/prisma';

async function main() {
  const products = await prisma.product.findMany({
    include: {
      stores: { include: { store: true } },
    },
  });

  console.log(`\nFound ${products.length} products in database:`);
  for (const p of products) {
    console.log(`\nProduct: ${p.name} (${p.brand}) - Best Price: Rs. ${p.bestPrice?.toLocaleString('en-IN')}`);
    console.log(`Image: ${p.imageUrl}`);
    console.log(`Specs count: ${p.specs.length}`);
    for (const st of p.stores) {
      const historyCount = await prisma.priceHistory.count({
        where: { productStoreId: st.id },
      });
      console.log(`  Store: ${st.store.name} -> Rs. ${st.currentPrice.toLocaleString('en-IN')} (${historyCount} price history rows)`);
    }
  }

  const totalHistory = await prisma.priceHistory.count();
  console.log(`\nTotal PriceHistory records in database: ${totalHistory}`);
}

main().finally(() => prisma.$disconnect());
