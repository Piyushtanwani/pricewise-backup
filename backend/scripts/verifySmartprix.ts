import dotenv from 'dotenv';
dotenv.config();

import { smartprixClient, ParseBotError } from '../src/services/smartprix/smartprixClient';
import { groqNormalizer } from '../src/services/smartprix/groqNormalizer';

async function main() {
  console.log('--- PriceWise: Parse.bot Smartprix Verification ---');

  if (!smartprixClient.isConfigured()) {
    console.log('[STATUS] PARSE_API_KEY is not configured in backend/.env.');
    console.log('[ACTION NEEDED] Please add your Parse.bot API key to backend/.env:');
    console.log('                PARSE_API_KEY=pmx_your_api_key_here');
    console.log('\nOnce you configure your key, run: npx tsx scripts/verifySmartprix.ts\n');
    return;
  }

  console.log('[STATUS] PARSE_API_KEY is loaded successfully (masked).');

  // Step 1: Test search_smartphones
  console.log('\n[TEST 1] Calling search_smartphones (minimal query)...');
  try {
    const searchRes = await smartprixClient.searchSmartphones({
      query: 'samsung',
      page: 1,
    }) as any;

    console.log('[SUCCESS] search_smartphones returned HTTP 200.');
    console.log('[DATA SUMMARY] Top-level response keys:', Object.keys(searchRes || {}));

    console.log('[DEBUG FULL RESPONSE SHAPE]:', JSON.stringify(searchRes, null, 2).slice(0, 1500));

    let items: any[] = [];
    if (Array.isArray(searchRes)) items = searchRes;
    else if (Array.isArray(searchRes?.data)) items = searchRes.data;
    else if (searchRes?.data && typeof searchRes.data === 'object') {
      const keys = Object.keys(searchRes.data);
      console.log('[DATA INTERNAL KEYS]:', keys);
      for (const k of keys) {
        if (Array.isArray(searchRes.data[k])) {
          items = searchRes.data[k];
          console.log(`[FOUND ARRAY IN data.${k}]: ${items.length} items`);
          break;
        }
      }
    }
    console.log(`[RESULTS COUNT] Found ${items.length} items in search output.`);


    if (items.length > 0) {
      const firstItem = items[0];
      console.log('\n[SAMPLE PRODUCT FIELDS]:');
      console.log(JSON.stringify(firstItem, null, 2).slice(0, 800));

      const slug = firstItem.slug || firstItem.url || firstItem.link;
      const pid = firstItem.pid || firstItem.id;

      // Step 2: Test get_smartphone_details if slug is found
      if (slug) {
        console.log(`\n[TEST 2] Testing get_smartphone_details with slug: "${slug}"...`);
        try {
          const detailsRes = await smartprixClient.getSmartphoneDetails({ slug });
          console.log('[SUCCESS] get_smartphone_details succeeded.');
          console.log('Sample details keys:', Object.keys(detailsRes || {}));
        } catch (detailErr: any) {
          console.warn('[WARNING] get_smartphone_details error:', detailErr.message);
        }
      }

      // Step 3: Test get_smartphone_price_history if pid is found
      if (pid) {
        console.log(`\n[TEST 3] Testing get_smartphone_price_history with pid: "${pid}"...`);
        try {
          const historyRes = await smartprixClient.getSmartphonePriceHistory({ pid });
          console.log('[SUCCESS] get_smartphone_price_history succeeded.');
          console.log('Sample price history preview:', JSON.stringify(historyRes).slice(0, 300));
        } catch (histErr: any) {
          console.warn('[WARNING] get_smartphone_price_history error:', histErr.message);
        }
      }

      // Step 4: Test Groq Normalization if GROQ_API_KEY is set
      if (groqNormalizer.isConfigured()) {
        console.log('\n[TEST 4] Testing Groq Schema Transformation...');
        try {
          const groqRes = await groqNormalizer.normalizeWithGroq([firstItem]);
          console.log('[SUCCESS] Groq normalization succeeded.');
          console.log('Transformed PriceWise Product Schema:', JSON.stringify(groqRes.normalized, null, 2));
        } catch (groqErr: any) {
          console.warn('[WARNING] Groq normalization error:', groqErr.message);
        }
      } else {
        console.log('\n[INFO] GROQ_API_KEY is not set yet. Skipping Groq LLM transformation test.');
      }
    }
  } catch (err: any) {
    if (err instanceof ParseBotError) {
      console.error(`[API ERROR] Parse.bot returned error (HTTP ${err.statusCode}): ${err.message}`);
      if (err.details) {
        console.error('Error Details:', JSON.stringify(err.details));
      }
    } else {
      console.error('[UNEXPECTED ERROR]', err.message);
    }
  }
}

main().catch(console.error);
