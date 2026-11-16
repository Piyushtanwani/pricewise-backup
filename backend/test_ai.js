const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { AIOrchestrator } = require('./dist/src/services/gemini/aiOrchestrator');

async function test() {
  console.log('Testing Gemini AI Orchestrator + Groq Markdown Stylist...');
  try {
    const res = await AIOrchestrator.answer('Should I buy iPhone 15 or Galaxy S25?');
    console.log('=== SUCCESS ===');
    console.log('Source:', res.source);
    console.log('Parsed intent:', res.parsed.intent);
    console.log('Products found:', res.products.map(p => `${p.brand} ${p.name} (₹${p.bestPrice})`));
    console.log('\n=== FORMATTED AI CONTENT ===\n');
    console.log(res.content);
    console.log('\n============================\n');
  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    process.exit(0);
  }
}

test();

