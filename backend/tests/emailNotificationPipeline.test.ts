import './setup';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SendMailOptions, Transporter } from 'nodemailer';
import prisma from '../src/utils/prisma';
import { evaluatePriceChange } from '../src/services/alertEngine';
import {
  sendPriceDropAlertEmail,
  sendPriceAlertConfirmationEmail,
  setTransporterForTesting,
  escapeHtml,
  isValidHttpUrl,
  isValidEmail,
} from '../src/services/emailService';
import {
  isPriceFresh,
  isSyntheticProduct,
  validatePriceDrop,
  SYNTHETIC_PRODUCT_IDS,
} from '../src/services/dataProvenance';

// Helper mock transporter
class MockTransporter {
  public sentMails: SendMailOptions[] = [];
  public failCount = 0;
  public totalCalls = 0;

  constructor(failsBeforeSuccess = 0) {
    this.failCount = failsBeforeSuccess;
  }

  async sendMail(opts: SendMailOptions) {
    this.totalCalls++;
    if (this.failCount > 0) {
      this.failCount--;
      throw new Error('ETIMEDOUT: Transient connection failure');
    }
    this.sentMails.push(opts);
    return { messageId: `mock-msg-${Date.now()}` };
  }
}

let mock: MockTransporter;

beforeEach(() => {
  mock = new MockTransporter();
  setTransporterForTesting(mock as unknown as Transporter);
});

afterEach(() => {
  setTransporterForTesting(null);
});

// -----------------------------------------------------------------------------------------
// 1. A genuine price drop crossing the user's alert threshold
// -----------------------------------------------------------------------------------------
test('1. Genuine price drop crossing alert threshold sends real database product and retailer data', async () => {
  // Query a genuine product from catalogue
  const genuineProduct = await prisma.product.findFirst({
    where: {
      id: { notIn: Array.from(SYNTHETIC_PRODUCT_IDS) },
      stores: { some: { stockStatus: 'IN_STOCK' } },
    },
    include: {
      stores: { include: { store: true } },
      bestStore: true,
    },
  });

  assert.ok(genuineProduct, 'Catalogue should contain at least one genuine product');

  // Verify fresh listing
  const activeListing = genuineProduct.stores.find((s) => s.stockStatus !== 'OUT_OF_STOCK') || genuineProduct.stores[0];
  await prisma.productStore.update({
    where: { id: activeListing.id },
    data: { lastCheckedAt: new Date(), currentPrice: 42000 },
  });

  // Create temporary test user & alert
  const testUser = await prisma.user.create({
    data: {
      email: `test-genuine-drop-${Date.now()}@example.com`,
      name: 'Piyush Tester',
      password: 'password123',
    },
  });

  const targetPrice = 45000;
  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: genuineProduct.id,
      targetPrice,
      notifyEmail: true,
      notifyInApp: true,
      isActive: true,
    },
  });

  try {
    const previousBest = 48000;
    const newBest = 42000;

    const notifCount = await evaluatePriceChange(genuineProduct.id, previousBest, newBest);
    assert.ok(notifCount >= 1, 'Should create at least 1 notification');

    // Verify email was dispatched
    assert.equal(mock.sentMails.length, 1, 'Exactly one price drop email should be sent');
    const sent = mock.sentMails[0];

    assert.equal(sent.to, testUser.email);
    assert.ok(typeof sent.subject === 'string' && sent.subject.includes(genuineProduct.name));
    assert.ok(typeof sent.subject === 'string' && sent.subject.includes('42,000'));

    const html = String(sent.html);
    // Real data checks
    assert.ok(html.includes(genuineProduct.name), 'Email HTML must contain the real product name');
    assert.ok(html.includes('42,000'), 'Email HTML must contain current price');
    assert.ok(html.includes('48,000'), 'Email HTML must contain real previous price');
    assert.ok(html.includes('6,000'), 'Email HTML must contain real calculated savings (48000 - 42000 = 6000)');
    assert.ok(html.includes('13% off'), 'Email HTML must contain verified percentage savings (6000/48000 = 12.5% -> 13%)');

    const expectedStore = genuineProduct.bestStore?.name || activeListing.store.name;
    assert.ok(html.includes(expectedStore), `Email HTML must reference real store name (${expectedStore})`);

    // Must NOT contain mock demo fallbacks
    assert.ok(!html.includes('Retail Store'), 'Email must NOT contain hardcoded fallback "Retail Store"');
    assert.ok(!html.includes('tracked smartphone just got cheaper'), 'Email must not contain hardcoded "smartphone" copy');

    // Verify alert is marked triggered
    const freshAlert = await prisma.alert.findUnique({ where: { id: alert.id } });
    assert.ok(freshAlert?.triggeredAt, 'Alert must be marked with triggeredAt timestamp to prevent duplicate firing');
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.notification.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 2. No price change
// -----------------------------------------------------------------------------------------
test('2. No price change does not trigger price drop email', async () => {
  const genuineProduct = await prisma.product.findFirst({
    where: { id: { notIn: Array.from(SYNTHETIC_PRODUCT_IDS) } },
    include: { stores: { include: { store: true } } },
  });
  assert.ok(genuineProduct);

  const testUser = await prisma.user.create({
    data: {
      email: `test-no-change-${Date.now()}@example.com`,
      name: 'Unchanged Price User',
      password: 'password123',
    },
  });

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: genuineProduct.id,
      targetPrice: 50000,
      notifyEmail: true,
      isActive: true,
    },
  });

  try {
    // Current price is equal to previous price: NO price drop occurred
    const price = 40000;
    await evaluatePriceChange(genuineProduct.id, price, price);

    assert.equal(mock.sentMails.length, 0, 'No email must be sent when price did not change');
    const freshAlert = await prisma.alert.findUnique({ where: { id: alert.id } });
    assert.equal(freshAlert?.triggeredAt, null, 'Alert should not be triggered when price was unchanged');
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 3. Price above the alert threshold
// -----------------------------------------------------------------------------------------
test('3. Price above alert threshold does not trigger email', async () => {
  const genuineProduct = await prisma.product.findFirst({
    where: { id: { notIn: Array.from(SYNTHETIC_PRODUCT_IDS) } },
  });
  assert.ok(genuineProduct);

  const testUser = await prisma.user.create({
    data: {
      email: `test-above-target-${Date.now()}@example.com`,
      name: 'High Target User',
      password: 'password123',
    },
  });

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: genuineProduct.id,
      targetPrice: 30000, // target is 30,000
      notifyEmail: true,
      isActive: true,
    },
  });

  try {
    // Price drops from 50,000 to 40,000, but is STILL above the target 30,000
    await evaluatePriceChange(genuineProduct.id, 50000, 40000);

    assert.equal(mock.sentMails.length, 0, 'No email must be sent because price is above threshold');
    const freshAlert = await prisma.alert.findUnique({ where: { id: alert.id } });
    assert.equal(freshAlert?.triggeredAt, null);
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 4. Missing or stale price data
// -----------------------------------------------------------------------------------------
test('4. Missing or stale price data suppresses email alert', async () => {
  const genuineProduct = await prisma.product.findFirst({
    where: { id: { notIn: Array.from(SYNTHETIC_PRODUCT_IDS) } },
    include: { stores: true },
  });
  assert.ok(genuineProduct && genuineProduct.stores.length > 0);

  const listing = genuineProduct.stores[0];

  // Set lastCheckedAt to 45 days ago (stale) for all listings
  const staleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  await prisma.productStore.updateMany({
    where: { productId: genuineProduct.id },
    data: { lastCheckedAt: staleDate },
  });

  // Verify freshness helper directly
  assert.equal(isPriceFresh(staleDate), false, '45 days old price should be identified as stale');
  assert.equal(isPriceFresh(null), false, 'Null timestamp should be identified as stale');
  assert.equal(isPriceFresh(new Date()), true, 'Current timestamp should be identified as fresh');

  const testUser = await prisma.user.create({
    data: {
      email: `test-stale-${Date.now()}@example.com`,
      name: 'Stale Check User',
      password: 'password123',
    },
  });

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: genuineProduct.id,
      targetPrice: 50000,
      notifyEmail: true,
      isActive: true,
    },
  });

  try {
    // Attempt evaluation with stale data
    const result = await evaluatePriceChange(genuineProduct.id, 60000, 40000);
    assert.equal(result, 0, 'Evaluation should return 0 when price is stale');
    assert.equal(mock.sentMails.length, 0, 'No email should be dispatched on stale price');

    // Also verify missing or invalid price <= 0 returns 0
    const zeroResult = await evaluatePriceChange(genuineProduct.id, 60000, 0);
    assert.equal(zeroResult, 0, 'Zero or negative price must return 0');
  } finally {
    // Restore listing lastCheckedAt
    await prisma.productStore.updateMany({
      where: { productId: genuineProduct.id },
      data: { lastCheckedAt: new Date() },
    });
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 5. Synthetic or demo data
// -----------------------------------------------------------------------------------------
test('5. Synthetic or demo data suppresses email alert', async () => {
  // Take one of the known synthetic seed products
  const syntheticId = Array.from(SYNTHETIC_PRODUCT_IDS)[0];
  let syntheticProduct = await prisma.product.findUnique({
    where: { id: syntheticId },
    include: { stores: true },
  });

  let createdSynthetic = false;
  if (!syntheticProduct) {
    syntheticProduct = await prisma.product.create({
      data: {
        id: syntheticId,
        name: 'iPhone 16 Pro Max 256GB Natural Titanium',
        brand: 'Apple',
        category: 'Mobiles',
      },
      include: { stores: true },
    });
    createdSynthetic = true;
  }

  assert.ok(syntheticProduct, 'Synthetic seed product should exist in database');
  assert.equal(isSyntheticProduct(syntheticProduct), true, 'Must be flagged as synthetic');

  const testUser = await prisma.user.create({
    data: {
      email: `test-synthetic-${Date.now()}@example.com`,
      name: 'Synthetic Check User',
      password: 'password123',
    },
  });

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: syntheticId,
      targetPrice: 100000,
      notifyEmail: true,
      isActive: true,
    },
  });

  try {
    // Price drop on synthetic item
    const count = await evaluatePriceChange(syntheticId, 90000, 75000);
    assert.equal(count, 0, 'Synthetic products must not generate alerts or emails');
    assert.equal(mock.sentMails.length, 0, 'No email should be dispatched for synthetic/seed items');
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    if (createdSynthetic) {
      await prisma.product.deleteMany({ where: { id: syntheticId } });
    }
  }
});

// -----------------------------------------------------------------------------------------
// 6. Product not found
// -----------------------------------------------------------------------------------------
test('6. Non-existent product is handled safely without throwing or sending emails', async () => {
  const nonExistentId = '00000000-0000-0000-0000-000000000000';
  const count = await evaluatePriceChange(nonExistentId, 10000, 8000);
  assert.equal(count, 0);
  assert.equal(mock.sentMails.length, 0);
});

// -----------------------------------------------------------------------------------------
// 7. Invalid product URL, HTML escaping, and missing optional fields
// -----------------------------------------------------------------------------------------
test('7. Invalid product URL or missing optional fields handled safely with HTML escaping', async () => {
  // Test invalid URL rejection
  const invalidUrlRes = await sendPriceDropAlertEmail({
    email: 'user@example.com',
    productName: 'Sample Product',
    currentPrice: 15000,
    bestStore: 'Amazon',
    productUrl: 'javascript:alert(1)', // Malicious / invalid URL
  });
  assert.equal(invalidUrlRes.success, false);
  assert.equal(invalidUrlRes.error, 'Valid productUrl is required');
  assert.equal(mock.sentMails.length, 0);

  // Test missing product name rejection
  const missingNameRes = await sendPriceDropAlertEmail({
    email: 'user@example.com',
    productName: '',
    currentPrice: 15000,
    bestStore: 'Amazon',
    productUrl: 'https://www.amazon.in/dp/B012345',
  });
  assert.equal(missingNameRes.success, false);
  assert.equal(missingNameRes.error, 'Product name is required');

  // Test missing store name rejection (no mock 'Retail Store' allowed!)
  const missingStoreRes = await sendPriceDropAlertEmail({
    email: 'user@example.com',
    productName: 'Sample Product',
    currentPrice: 15000,
    bestStore: 'Retail Store', // Specifically rejected as mock fallback
    productUrl: 'https://www.amazon.in/dp/B012345',
  });
  assert.equal(missingStoreRes.success, false);
  assert.equal(missingStoreRes.error, 'Verified retailer name is required');

  // Test missing optional fields & HTML escaping
  const xssName = '<script>alert("xss")</script> & <b>Deal</b>';
  const successRes = await sendPriceDropAlertEmail({
    email: 'user@example.com',
    productName: xssName,
    currentPrice: 15000,
    bestStore: 'Croma & Sons',
    productUrl: 'https://www.croma.com/product/12345',
    // userName omitted, brand omitted, imageUrl omitted, previousPrice omitted
  });

  assert.equal(successRes.success, true);
  assert.equal(mock.sentMails.length, 1);
  const emailHtml = String(mock.sentMails[0].html);

  // Check HTML escaping
  assert.ok(!emailHtml.includes('<script>'), 'Raw script tags must not be rendered in HTML email');
  assert.ok(emailHtml.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &lt;b&gt;Deal&lt;/b&gt;'));
  assert.ok(emailHtml.includes('Croma &amp; Sons'));

  // Optional fields omitted cleanly: no broken image, no "Smartphone" brand
  assert.ok(!emailHtml.includes('<img src=""'), 'Must not render empty image tag');
  assert.ok(!emailHtml.includes('Smartphone'), 'Must not substitute default "Smartphone" brand');
  assert.ok(!emailHtml.includes('Old Price'), 'Must not invent an old price when none was provided');
});

// -----------------------------------------------------------------------------------------
// 8. Duplicate alert prevention and re-arming
// -----------------------------------------------------------------------------------------
test('8. Duplicate alert prevention and re-arming behavior', async () => {
  const genuineProduct = await prisma.product.findFirst({
    where: {
      id: { notIn: Array.from(SYNTHETIC_PRODUCT_IDS) },
      stores: { some: { stockStatus: 'IN_STOCK' } },
    },
    include: { stores: true },
  });
  assert.ok(genuineProduct);

  await prisma.productStore.updateMany({
    where: { productId: genuineProduct.id },
    data: { lastCheckedAt: new Date() },
  });

  const testUser = await prisma.user.create({
    data: {
      email: `test-dup-${Date.now()}@example.com`,
      name: 'Dup Tester',
      password: 'password123',
    },
  });

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: genuineProduct.id,
      targetPrice: 50000,
      notifyEmail: true,
      isActive: true,
    },
  });

  try {
    // First drop: price goes from 55,000 to 48,000 (crosses target 50,000)
    await evaluatePriceChange(genuineProduct.id, 55000, 48000);
    assert.equal(mock.sentMails.length, 1, 'First price drop triggers exactly 1 email');

    // Second sync: price drops even further from 48,000 to 47,000
    // Because alert is already triggered (alert.triggeredAt is not null), it should NOT send duplicate email
    await evaluatePriceChange(genuineProduct.id, 48000, 47000);
    assert.equal(mock.sentMails.length, 1, 'Duplicate email must be suppressed while alert remains in triggered state');

    // Re-arm: price rises back above target (to 52,000)
    await evaluatePriceChange(genuineProduct.id, 47000, 52000);
    const rearmedAlert = await prisma.alert.findUnique({ where: { id: alert.id } });
    assert.equal(rearmedAlert?.triggeredAt, null, 'Alert should be re-armed when price rises back above target');

    // Third drop: price drops below target again (52,000 to 46,000)
    await evaluatePriceChange(genuineProduct.id, 52000, 46000);
    assert.equal(mock.sentMails.length, 2, 'Re-armed alert should fire again on subsequent genuine price drop');
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.notification.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 9. Email service failure and retry behavior
// -----------------------------------------------------------------------------------------
test('9. Email service failure and retry behavior', async () => {
  // Transporter configured to fail once, then succeed on retry
  const retryTransporter = new MockTransporter(1);
  setTransporterForTesting(retryTransporter as unknown as Transporter);

  const res = await sendPriceDropAlertEmail({
    email: 'retry-test@example.com',
    productName: 'Retrying Product',
    currentPrice: 20000,
    previousPrice: 24000,
    bestStore: 'Vijay Sales',
    productUrl: 'https://www.vijaysales.com/product/123',
  });

  assert.equal(res.success, true, 'Email send should succeed after retry');
  assert.equal(retryTransporter.totalCalls, 2, 'Should have made 2 calls (1 failed attempt + 1 successful retry)');

  // Transporter configured to fail permanently
  const persistentFailTransporter = new MockTransporter(10);
  setTransporterForTesting(persistentFailTransporter as unknown as Transporter);

  const failRes = await sendPriceDropAlertEmail({
    email: 'permanent-fail@example.com',
    productName: 'Failing Product',
    currentPrice: 20000,
    bestStore: 'Vijay Sales',
    productUrl: 'https://www.vijaysales.com/product/123',
  });

  assert.equal(failRes.success, false, 'Should fail gracefully without throwing uncaught exceptions');
  assert.ok(failRes.error?.includes('ETIMEDOUT'));
});
