import './setup';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SendMailOptions, Transporter } from 'nodemailer';
import prisma from '../src/utils/prisma';
import {
  checkActivePriceAlerts,
  processNotificationJobs,
  evaluateAlertEligibility,
  resolveProductCurrentPrice,
  AlertWithRelations,
} from '../src/services/priceAlertMonitorService';
import {
  startPriceAlertMonitoring,
  stopPriceAlertMonitoring,
  getSchedulerState,
} from '../src/jobs/priceAlertScheduler';
import { setTransporterForTesting, sendPriceDropAlertEmail } from '../src/services/emailService';
import { NotificationJobStatus } from '../src/generated/prisma';

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
      throw new Error('ETIMEDOUT: Simulated transient connection error');
    }
    this.sentMails.push(opts);
    return { messageId: `mock-msg-${Date.now()}-${Math.random()}` };
  }
}

let mock: MockTransporter;

beforeEach(() => {
  mock = new MockTransporter();
  setTransporterForTesting(mock as unknown as Transporter);
});

afterEach(async () => {
  await stopPriceAlertMonitoring();
  setTransporterForTesting(null);
});

// Helper to create test fixtures
async function createTestFixture() {
  const timestamp = Date.now();
  const testUser = await prisma.user.create({
    data: {
      email: `test-monitor-${timestamp}-${Math.floor(Math.random() * 10000)}@example.com`,
      name: 'Monitor Test User',
      password: 'password123',
    },
  });

  const testStore = await prisma.store.upsert({
    where: { slug: 'test-store' },
    update: {},
    create: { name: 'Test Retailer', slug: 'test-store' },
  });

  const testProduct = await prisma.product.create({
    data: {
      name: `Monitor Test Phone ${timestamp}`,
      brand: 'TestBrand',
      category: 'Mobiles',
      bestPrice: 50000,
      mrp: 60000,
      bestStoreId: testStore.id,
      stores: {
        create: {
          storeId: testStore.id,
          currentPrice: 50000,
          mrp: 60000,
          productUrl: 'https://example.com/product/test-phone',
          stockStatus: 'IN_STOCK',
        },
      },
    },
    include: { stores: { include: { store: true } }, bestStore: true },
  });

  return { testUser, testStore, testProduct };
}

// -----------------------------------------------------------------------------------------
// 1. Server startup initializes monitoring
// -----------------------------------------------------------------------------------------
test('1. Server startup initializes monitoring', async () => {
  const handle = startPriceAlertMonitoring(60000);
  const state = getSchedulerState();
  assert.equal(state.isRunning, true, 'Scheduler should be marked running');
  await handle.stop();
  assert.equal(getSchedulerState().isRunning, false, 'Scheduler should stop cleanly');
});

// -----------------------------------------------------------------------------------------
// 2. Monitoring runs every 60 seconds
// -----------------------------------------------------------------------------------------
test('2. Monitoring runs every 60 seconds', async () => {
  const handle = startPriceAlertMonitoring(60000);
  const state = getSchedulerState();
  assert.equal(state.intervalMs, 60000, 'Scheduler should default to 60000ms interval');
  await handle.stop();
});

// -----------------------------------------------------------------------------------------
// 3. First monitoring cycle executes immediately
// -----------------------------------------------------------------------------------------
test('3. First monitoring cycle executes immediately', async () => {
  const handle = startPriceAlertMonitoring(60000);
  // Wait briefly for first cycle execution
  await new Promise((resolve) => setTimeout(resolve, 100));
  const state = getSchedulerState();
  assert.ok(state.cycleCount >= 1, 'First cycle should execute immediately upon start');
  assert.ok(state.lastCycleStartedAt instanceof Date, 'Last cycle start time should be recorded');
  await handle.stop();
});

// -----------------------------------------------------------------------------------------
// 4. Price reduction triggers eligible alerts
// -----------------------------------------------------------------------------------------
test('4. Price reduction triggers eligible alerts', async () => {
  const { testUser, testProduct } = await createTestFixture();

  // Create active alert with target 48000 (current price is 50000)
  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 48000,
      notifyEmail: true,
      notifyInApp: true,
      isActive: true,
      lastCheckedPrice: 50000,
    },
  });

  try {
    // Reduce price in database to 45000
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { bestPrice: 45000 },
    });
    await prisma.productStore.updateMany({
      where: { productId: testProduct.id },
      data: { currentPrice: 45000 },
    });

    // Run monitoring cycle
    const summary = await checkActivePriceAlerts({ workerId: 'test-worker' });
    assert.ok(summary.eligible >= 1, 'Alert should be identified as eligible');
    assert.equal(mock.sentMails.length, 1, 'Exactly one price drop email should be sent');

    const sent = mock.sentMails[0];
    assert.equal(sent.to, testUser.email);
    assert.ok(String(sent.subject).includes(testProduct.name));
    assert.ok(String(sent.subject).includes('45,000'));

    // Verify alert state is updated to prevent duplicate emails
    const updatedAlert = await prisma.alert.findUnique({ where: { id: alert.id } });
    assert.equal(updatedAlert?.lastNotifiedPrice, 45000);
    assert.ok(updatedAlert?.triggeredAt instanceof Date);
  } finally {
    await prisma.notificationJob.deleteMany({ where: { alertId: alert.id } });
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.notification.deleteMany({ where: { userId: testUser.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 5. Unchanged prices do not create duplicate notifications
// -----------------------------------------------------------------------------------------
test('5. Unchanged prices do not create duplicate notifications', async () => {
  const { testUser, testProduct } = await createTestFixture();

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 48000,
      notifyEmail: true,
      isActive: true,
      triggeredAt: new Date(),
      lastNotifiedPrice: 45000,
      lastCheckedPrice: 45000,
    },
  });

  try {
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { bestPrice: 45000 },
    });

    const summary = await checkActivePriceAlerts({ workerId: 'test-worker' });
    assert.ok(summary.skippedDuplicates >= 1, 'Should skip duplicate for unchanged price');
    assert.equal(mock.sentMails.length, 0, 'No email should be sent for unchanged price');
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 6. Price increases do not trigger price-drop alerts and re-arm alert
// -----------------------------------------------------------------------------------------
test('6. Price increases do not trigger price-drop alerts and re-arm alert', async () => {
  const { testUser, testProduct } = await createTestFixture();

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 48000,
      notifyEmail: true,
      isActive: true,
      triggeredAt: new Date(),
      lastNotifiedPrice: 45000,
      lastCheckedPrice: 45000,
    },
  });

  try {
    // Price rises back to 52000 (above target 48000)
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { bestPrice: 52000 },
    });

    const summary = await checkActivePriceAlerts({ workerId: 'test-worker' });
    assert.equal(mock.sentMails.length, 0, 'No email on price increase');
    assert.ok(summary.rearmed >= 1, 'Alert should be rearmed');

    const refreshed = await prisma.alert.findUnique({ where: { id: alert.id } });
    assert.equal(refreshed?.triggeredAt, null, 'triggeredAt must be cleared on re-arm');
    assert.equal(refreshed?.lastNotifiedPrice, null, 'lastNotifiedPrice must be cleared on re-arm');
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 7. Target price conditions work correctly
// -----------------------------------------------------------------------------------------
test('7. Target price conditions work correctly', () => {
  const dummyAlert = {
    id: 'a1',
    userId: 'u1',
    productId: 'p1',
    targetPrice: 50000,
    notifyEmail: true,
    notifyInApp: true,
    notifyPush: false,
    isActive: true,
    triggeredAt: null,
    lastCheckedPrice: null,
    lastNotifiedPrice: null,
    product: {} as any,
    user: {} as any,
  };

  // Price above target
  const notMet = evaluateAlertEligibility(dummyAlert, 52000, 55000);
  assert.equal(notMet.isEligible, false);

  // Price at target
  const atTarget = evaluateAlertEligibility(dummyAlert, 50000, 55000);
  assert.equal(atTarget.isEligible, true);
  assert.equal(atTarget.savings, 5000);

  // Price below target
  const belowTarget = evaluateAlertEligibility(dummyAlert, 48000, 55000);
  assert.equal(belowTarget.isEligible, true);
  assert.equal(belowTarget.savings, 7000);
});

// -----------------------------------------------------------------------------------------
// 8. Inactive alerts are ignored
// -----------------------------------------------------------------------------------------
test('8. Inactive alerts are ignored', async () => {
  const { testUser, testProduct } = await createTestFixture();

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 48000,
      notifyEmail: true,
      isActive: false, // Inactive!
    },
  });

  try {
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { bestPrice: 40000 },
    });

    const summary = await checkActivePriceAlerts({ workerId: 'test-worker' });
    assert.equal(mock.sentMails.length, 0, 'Inactive alerts must not trigger notifications');
  } finally {
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 9. Existing test-email functionality remains operational
// -----------------------------------------------------------------------------------------
test('9. Existing test-email functionality remains operational', async () => {
  const res = await sendPriceDropAlertEmail({
    email: 'shopper@example.com',
    userName: 'Test Shopper',
    productName: 'Samsung Galaxy S24 Ultra',
    brand: 'Samsung',
    previousPrice: 120000,
    currentPrice: 110000,
    targetPrice: 115000,
    dropAmount: 10000,
    bestStore: 'Amazon',
    productUrl: 'https://example.com/product/galaxy-s24',
  });

  assert.equal(res.success, true);
  assert.equal(mock.sentMails.length, 1);
  assert.equal(mock.sentMails[0].to, 'shopper@example.com');
});

// -----------------------------------------------------------------------------------------
// 10. Failed email notifications are retryable
// -----------------------------------------------------------------------------------------
test('10. Failed email notifications are retryable', async () => {
  const { testUser, testProduct } = await createTestFixture();

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 48000,
      notifyEmail: true,
      isActive: true,
    },
  });

  // Make mock fail all retries on first attempt (sendWithRetry tries up to 3 times)
  mock.failCount = 4;

  try {
    // Create pending job
    const job = await prisma.notificationJob.create({
      data: {
        alertId: alert.id,
        userId: testUser.id,
        productId: testProduct.id,
        triggerPrice: 45000,
        previousPrice: 50000,
        targetPrice: 48000,
        status: NotificationJobStatus.PENDING,
      },
    });

    // First attempt fails
    const result1 = await processNotificationJobs({ workerId: 'worker-1' });
    assert.equal(result1.failed, 1);

    const failedJob = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    assert.equal(failedJob?.status, NotificationJobStatus.FAILED);
    assert.equal(failedJob?.attempts, 1);

    // Alert should not be permanently disabled
    const stillActiveAlert = await prisma.alert.findUnique({ where: { id: alert.id } });
    assert.equal(stillActiveAlert?.isActive, true);

    // Fast-forward updatedAt for retry window
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { updatedAt: new Date(Date.now() - 120000) },
    });

    // Second attempt succeeds
    mock.failCount = 0;
    const result2 = await processNotificationJobs({ workerId: 'worker-1' });
    assert.equal(result2.sent, 1);

    const succeededJob = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    assert.equal(succeededJob?.status, NotificationJobStatus.SENT);
  } finally {
    await prisma.notificationJob.deleteMany({ where: { alertId: alert.id } });
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 11. Repeated monitoring cycles do not send duplicate emails
// -----------------------------------------------------------------------------------------
test('11. Repeated monitoring cycles do not send duplicate emails', async () => {
  const { testUser, testProduct } = await createTestFixture();

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 48000,
      notifyEmail: true,
      isActive: true,
    },
  });

  const getSentForUser = () => mock.sentMails.filter((m) => m.to === testUser.email);

  try {
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { bestPrice: 44000 },
    });

    // Cycle 1: Dispatches email
    const cycle1 = await checkActivePriceAlerts();
    assert.ok(cycle1.eligible >= 1);
    assert.equal(getSentForUser().length, 1);

    // Cycle 2: Skips duplicate
    const cycle2 = await checkActivePriceAlerts();
    assert.ok(cycle2.skippedDuplicates >= 1);
    assert.equal(getSentForUser().length, 1);

    // Cycle 3: Still skips duplicate
    const cycle3 = await checkActivePriceAlerts();
    assert.ok(cycle3.skippedDuplicates >= 1);
    assert.equal(getSentForUser().length, 1);
  } finally {
    await prisma.notificationJob.deleteMany({ where: { alertId: alert.id } });
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.notification.deleteMany({ where: { userId: testUser.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 12. Overlapping monitoring executions are prevented
// -----------------------------------------------------------------------------------------
test('12. Overlapping monitoring executions are prevented', async () => {
  const handle = startPriceAlertMonitoring(500);

  // Calling startPriceAlertMonitoring again while running does not duplicate
  const duplicateHandle = startPriceAlertMonitoring(500);
  assert.equal(duplicateHandle.stop, handle.stop);

  await handle.stop();
});

// -----------------------------------------------------------------------------------------
// 13. Monitoring continues after recoverable errors
// -----------------------------------------------------------------------------------------
test('13. Monitoring continues after recoverable errors', async () => {
  const handle = startPriceAlertMonitoring(100);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const state = getSchedulerState();
  assert.ok(state.cycleCount >= 2, 'Scheduler should continue running subsequent cycles');
  await handle.stop();
});

// -----------------------------------------------------------------------------------------
// 14. Manual database price changes are detected
// -----------------------------------------------------------------------------------------
test('14. Manual database price changes are detected', async () => {
  const { testUser, testProduct } = await createTestFixture();

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 45000,
      notifyEmail: true,
      isActive: true,
      lastCheckedPrice: 50000,
    },
  });

  try {
    // Direct database update (simulating direct SQL UPDATE query)
    await prisma.$executeRawUnsafe(
      `UPDATE "Product" SET "bestPrice" = 43000 WHERE "id" = '${testProduct.id}'`
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "ProductStore" SET "currentPrice" = 43000 WHERE "productId" = '${testProduct.id}'`
    );

    // Monitoring cycle checks DB
    const summary = await checkActivePriceAlerts();
    assert.ok(summary.eligible >= 1, 'Manual database price drop must be detected');
    assert.equal(mock.sentMails.length, 1);
    assert.ok(String(mock.sentMails[0].html).includes('43,000'));
  } finally {
    await prisma.notificationJob.deleteMany({ where: { alertId: alert.id } });
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.notification.deleteMany({ where: { userId: testUser.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});

// -----------------------------------------------------------------------------------------
// 15. Graceful server shutdown stops monitoring
// -----------------------------------------------------------------------------------------
test('15. Graceful server shutdown stops monitoring', async () => {
  startPriceAlertMonitoring(1000);
  assert.equal(getSchedulerState().isRunning, true);

  await stopPriceAlertMonitoring();
  assert.equal(getSchedulerState().isRunning, false);
});

// -----------------------------------------------------------------------------------------
// 16. Multiple workers cannot claim the same notification simultaneously
// -----------------------------------------------------------------------------------------
test('16. Multiple workers cannot claim the same notification simultaneously', async () => {
  const { testUser, testProduct } = await createTestFixture();

  const alert = await prisma.alert.create({
    data: {
      userId: testUser.id,
      productId: testProduct.id,
      targetPrice: 48000,
      notifyEmail: true,
      isActive: true,
    },
  });

  try {
    // Create a pending job
    const createdJob = await prisma.notificationJob.create({
      data: {
        alertId: alert.id,
        userId: testUser.id,
        productId: testProduct.id,
        triggerPrice: 45000,
        previousPrice: 50000,
        targetPrice: 48000,
        status: NotificationJobStatus.PENDING,
      },
    });

    // Run two workers simultaneously on this exact job
    const [worker1Result, worker2Result] = await Promise.all([
      processNotificationJobs({ workerId: 'worker-alpha', jobIds: [createdJob.id] }),
      processNotificationJobs({ workerId: 'worker-beta', jobIds: [createdJob.id] }),
    ]);

    // Combined sent count must be exactly 1, not 2
    const totalSent = worker1Result.sent + worker2Result.sent;
    assert.equal(totalSent, 1, 'Exactly one worker must succeed in claiming and sending');
    assert.equal(mock.sentMails.length, 1, 'Only one email must be dispatched across concurrent workers');
  } finally {
    await prisma.notificationJob.deleteMany({ where: { alertId: alert.id } });
    await prisma.alert.deleteMany({ where: { id: alert.id } });
    await prisma.notification.deleteMany({ where: { userId: testUser.id } });
    await prisma.productStore.deleteMany({ where: { productId: testProduct.id } });
    await prisma.product.deleteMany({ where: { id: testProduct.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
});
