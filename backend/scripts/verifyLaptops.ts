import prisma from '../src/utils/prisma';

async function main() {
  const count = await prisma.product.count({ where: { category: 'Laptops' } });
  console.log(`\n================ REAL LAPTOPS IN DB: ${count} ================\n`);

  const samples = await prisma.product.findMany({
    where: { category: 'Laptops' },
    include: {
      bestStore: true,
      stores: {
        include: {
          store: true,
          _count: { select: { priceHistory: true } },
        },
      },
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  for (const p of samples) {
    console.log(`Product: ${p.name}`);
    console.log(`  Brand: ${p.brand} | Best Price: ₹${p.bestPrice} | Rating: ${p.rating}★ | Best Store: ${p.bestStore?.name}`);
    console.log(`  Image: ${p.imageUrl}`);
    console.log(`  Tech Specs:`, Object.keys(p.techSpecs as any || {}).join(', '));
    console.log(`  Store Listings (${p.stores.length}):`);
    for (const s of p.stores) {
      console.log(`    • [${s.store.name}] ₹${s.currentPrice} | History: ${s._count.priceHistory} pts`);
      console.log(`      URL: ${s.productUrl}`);
    }
    console.log('------------------------------------------------------------');
  }
}

main().finally(() => prisma.$disconnect());
