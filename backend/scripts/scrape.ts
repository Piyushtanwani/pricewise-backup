import 'dotenv/config';
import { runPythonScraper, ingestScrapedProducts } from '../src/services/scraperService';

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : 5;
  console.log(`Starting real Smartprix scraping for ${limit} products...`);
  
  const startTime = Date.now();
  const products = await runPythonScraper(limit);
  console.log(`Successfully scraped ${products.length} products. Now ingesting into PostgreSQL...`);
  
  const results = await ingestScrapedProducts(products);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\nDone in ${duration}s! Ingested ${results.length} products into PostgreSQL:`);
  for (const r of results) {
    console.log(` - [${r.brand}] ${r.name}: Rs. ${r.bestPrice.toLocaleString('en-IN')} (${r.historyPointsCount} history points across ${r.storesCount} stores)`);
  }
}

main().catch((err) => {
  console.error('Scrape & ingest failed:', err);
  process.exit(1);
});
