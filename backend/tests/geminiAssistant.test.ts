import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEMINI_TOOLS } from '../src/services/gemini/toolRegistry';
import { conversationManager } from '../src/services/gemini/conversationManager';
import { ResponseFormatter } from '../src/services/gemini/responseFormatter';
import { ToolExecutor } from '../src/services/gemini/toolExecutor';
import { AIOrchestrator } from '../src/services/gemini/aiOrchestrator';
import { answer } from '../src/services/assistant';

test('1. Tool Registry declares all 11 required Gemini functions with valid parameters', () => {
  const expectedTools = [
    'search_products',
    'get_product_details',
    'get_category_information',
    'compare_products',
    'get_best_deals',
    'get_store_prices',
    'get_price_history',
    'get_price_prediction',
    'get_category_recommendations',
    'get_cheaper_alternatives',
    'get_product_reviews_summary',
  ];

  const declaredNames = GEMINI_TOOLS.map((t) => t.name);
  for (const expected of expectedTools) {
    assert.ok(declaredNames.includes(expected), `Tool ${expected} must be registered in GEMINI_TOOLS`);
    const tool = GEMINI_TOOLS.find((t) => t.name === expected);
    assert.ok(tool?.description && tool.description.length > 10, `${expected} must have detailed description`);
    assert.ok(tool?.parameters, `${expected} must define parameter schema`);
  }
  assert.equal(declaredNames.length, 11);
});

test('2. ConversationManager maintains session isolation, user authentication scoping, and turn history', () => {
  const guestSessionA = 'guest_session_aaa';
  const guestSessionB = 'guest_session_bbb';
  const authenticatedUserId = 'user_998877';

  // Add turn to session A
  conversationManager.addTurn(guestSessionA, undefined, {
    userMessage: 'Show me OnePlus phones',
    modelResponse: 'Here are OnePlus smartphones',
    productIds: ['prod_oneplus_1'],
  });

  // Verify session A contains the turn
  const sessionA = conversationManager.getSession(guestSessionA);
  assert.equal(sessionA.turns.length, 2);
  assert.deepEqual(conversationManager.getShortlistedProducts(guestSessionA), ['prod_oneplus_1']);

  // Verify session B is isolated and empty
  const sessionB = conversationManager.getSession(guestSessionB);
  assert.equal(sessionB.turns.length, 0);

  // Add turn for authenticated user
  conversationManager.addTurn(undefined, authenticatedUserId, {
    userMessage: 'Compare Samsung and iPhone',
    modelResponse: 'Here is the comparison',
    productIds: ['prod_samsung_1', 'prod_apple_1'],
  });

  const authSession = conversationManager.getSession(undefined, authenticatedUserId);
  assert.equal(authSession.turns.length, 2);
  assert.deepEqual(conversationManager.getShortlistedProducts(undefined, authenticatedUserId), [
    'prod_samsung_1',
    'prod_apple_1',
  ]);

  // Clean up
  conversationManager.clearSession(guestSessionA);
  conversationManager.clearSession(guestSessionB);
  conversationManager.clearSession(undefined, authenticatedUserId);
});

test('3. ResponseFormatter resolves follow-up prompt suggestions correctly', () => {
  const followUpsTech = ResponseFormatter.generateFollowUps('technical_qa', [], 'AMOLED vs OLED');
  assert.ok(followUpsTech.length > 0);

  const mockProductCard: any = {
    id: 'test_prod_1',
    name: 'Apple iPhone 16 Pro',
    brand: 'Apple',
    bestPrice: 119900,
    mrp: 119900,
    discount: 0,
    bestStore: 'Amazon',
    rating: 4.8,
    reviews: 500,
  };

  const followUpsSingle = ResponseFormatter.generateFollowUps('buy_now', [mockProductCard], 'iPhone 16');
  assert.ok(followUpsSingle.some((f) => f.includes('Apple') || f.includes('iPhone')));

  const followUpsMulti = ResponseFormatter.generateFollowUps(
    'compare',
    [mockProductCard, { ...mockProductCard, id: 'test_prod_2', name: 'Samsung Galaxy S25' }],
    'Compare',
  );
  assert.ok(followUpsMulti.some((f) => f.includes('Compare')));
});

test('4. ToolExecutor: get_category_information returns indexed categories and brands', async () => {
  const res = await ToolExecutor.execute('get_category_information', {});
  assert.ok(Array.isArray(res.categories));
  assert.ok(res.categories.length > 0);
  for (const cat of res.categories) {
    assert.ok(cat.name);
    assert.ok(Array.isArray(cat.brands));
  }
});

test('5. ToolExecutor: search_products filters by budget constraints and returns structured specs', async () => {
  const res = await ToolExecutor.execute('search_products', {
    maxBudget: 60000,
    limit: 3,
  });
  assert.ok(Array.isArray(res.products));
  for (const p of res.products) {
    assert.ok(p.bestPrice <= 60000);
    assert.ok(p.name);
    assert.ok(p.bestStore);
  }
});

test('6. ToolExecutor: get_best_deals retrieves products with genuine discounts', async () => {
  const res = await ToolExecutor.execute('get_best_deals', { limit: 5 });
  assert.ok(Array.isArray(res.deals));
  for (const deal of res.deals) {
    assert.ok(deal.discountPercent > 0);
    assert.ok(deal.bestPrice > 0);
    assert.ok(deal.store);
  }
});

test('7. ToolExecutor: get_category_recommendations scores and ranks picks with explainable criteria', async () => {
  const res = await ToolExecutor.execute('get_category_recommendations', {
    budget: 50000,
    priority: 'value',
    limit: 3,
  });
  assert.ok(res.count >= 0);
  if (res.recommendations?.length > 0) {
    for (const rec of res.recommendations) {
      assert.ok(rec.bestPrice <= 50000);
      assert.ok(rec.verdict);
    }
  }
});

test('8. Full Assistant Integration: answers technical queries without requiring catalogue products', async () => {
  const res = await answer('What is the difference between AMOLED and OLED screens?');
  assert.equal(res.role, 'assistant');
  assert.ok(res.content.length > 50, 'Assistant should provide a comprehensive technical explanation');
  assert.ok(/amoled|oled|contrast|pixel/i.test(res.content), 'Content should explain AMOLED and OLED concepts');
  assert.ok(Array.isArray(res.insights));
});

test('9. Full Assistant Integration: answers processor questions objectively', async () => {
  const res = await answer('Snapdragon vs MediaTek Dimensity: which is better for gaming?');
  assert.equal(res.role, 'assistant');
  assert.ok(res.content.length > 50);
  assert.ok(/snapdragon|dimensity|gpu|performance/i.test(res.content));
});

test('10. Full Assistant Integration: multi-turn follow up context resolution', async () => {
  const testSession = 'test_multi_turn_' + Date.now();

  // First turn: suggest phones under 40k
  const turn1 = await answer('Best phone under ₹40,000', { sessionId: testSession });
  assert.equal(turn1.role, 'assistant');
  assert.ok(turn1.products.length > 0);

  // Second turn: follow up referring to programming or camera
  const turn2 = await answer('Which of these has the best camera and battery life?', { sessionId: testSession });
  assert.equal(turn2.role, 'assistant');
  assert.ok(turn2.content.length > 30);

  // Clean up
  conversationManager.clearSession(testSession);
});

