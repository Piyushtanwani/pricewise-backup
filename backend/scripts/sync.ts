/**
 * One-off price sync from the command line: `npm run sync` (all linked listings)
 * or `npm run sync -- <productId>` for a single product.
 */
import { syncPrices } from '../src/services/priceSync';
import { providerStatus } from '../src/services/stores';
import prisma from '../src/utils/prisma';

const main = async () => {
  const productId = process.argv[2];
  const status = providerStatus();
  for (const p of status) {
    console.log(`${p.store}: ${p.configured ? 'configured' : `skipped (missing ${p.missing.join(', ')})`}`);
  }
  if (!status.some((p) => p.configured)) {
    console.log('No store API credentials configured; nothing to sync.');
    return;
  }
  const summary = await syncPrices({ productId });
  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
