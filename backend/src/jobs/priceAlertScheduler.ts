import { checkActivePriceAlerts, MonitorCycleSummary } from '../services/priceAlertMonitorService';

export interface SchedulerState {
  isRunning: boolean;
  isShuttingDown: boolean;
  cycleCount: number;
  lastCycleStartedAt: Date | null;
  lastCycleFinishedAt: Date | null;
  lastCycleSummary: MonitorCycleSummary | null;
  intervalMs: number;
}

let timer: NodeJS.Timeout | null = null;
let isCycleExecuting = false;
let isShuttingDown = false;
let cycleCount = 0;
let lastCycleStartedAt: Date | null = null;
let lastCycleFinishedAt: Date | null = null;
let lastCycleSummary: MonitorCycleSummary | null = null;
let configuredIntervalMs = 60000;

export const getSchedulerState = (): SchedulerState => ({
  isRunning: !isShuttingDown && (timer !== null || isCycleExecuting),
  isShuttingDown,
  cycleCount,
  lastCycleStartedAt,
  lastCycleFinishedAt,
  lastCycleSummary,
  intervalMs: configuredIntervalMs,
});

/**
 * Starts the automatic 60-second price alert monitoring scheduler.
 * Executes the first cycle immediately, and schedules subsequent non-overlapping
 * cycles every 60 seconds.
 */
export const startPriceAlertMonitoring = (intervalMs = 60000): { stop: () => Promise<void> } => {
  configuredIntervalMs = intervalMs;

  if (timer !== null || isCycleExecuting) {
    console.log('[PRICE ALERT MONITOR] Monitoring service is already active.');
    return { stop: stopPriceAlertMonitoring };
  }

  isShuttingDown = false;
  console.log('[PRICE ALERT MONITOR] Monitoring service started');

  const runMonitoringCycle = async () => {
    if (isShuttingDown) return;

    if (isCycleExecuting) {
      console.warn('[PRICE ALERT MONITOR] Previous cycle still executing; skipping overlapping cycle.');
      return;
    }

    isCycleExecuting = true;
    lastCycleStartedAt = new Date();

    try {
      lastCycleSummary = await checkActivePriceAlerts();
      cycleCount++;
    } catch (err) {
      console.error('[PRICE ALERT MONITOR] Recoverable error during monitoring cycle:', err);
    } finally {
      isCycleExecuting = false;
      lastCycleFinishedAt = new Date();

      if (!isShuttingDown) {
        console.log('[PRICE ALERT MONITOR] Next cycle scheduled');
        timer = setTimeout(runMonitoringCycle, configuredIntervalMs);
        timer.unref();
      }
    }
  };

  // Execute the first monitoring cycle immediately after startup
  runMonitoringCycle();

  return { stop: stopPriceAlertMonitoring };
};

/**
 * Stops the price alert monitoring service gracefully.
 * Clears any pending timers and waits for in-flight cycles to finish.
 */
export const stopPriceAlertMonitoring = async (): Promise<void> => {
  isShuttingDown = true;

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  // Wait for any in-flight execution cycle to complete gracefully (up to 5s timeout)
  const maxWaitMs = 5000;
  const startWait = Date.now();
  while (isCycleExecuting && Date.now() - startWait < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log('[PRICE ALERT MONITOR] Monitoring service stopped gracefully');
};
