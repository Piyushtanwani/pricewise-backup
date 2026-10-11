import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SmartprixClient, ParseBotError } from '../src/services/smartprix/smartprixClient';
import { env } from '../src/config/env';

test('SmartprixClient handles missing API key gracefully', async () => {
  const originalKey = env.parseBot.apiKey;
  try {
    env.parseBot.apiKey = '';
    const client = new SmartprixClient();
    assert.equal(client.isConfigured(), false);
    assert.deepEqual(client.missingConfig(), ['PARSE_API_KEY']);

    await assert.rejects(
      async () => {
        await client.searchSmartphones({ query: 'Samsung Galaxy' });
      },
      (err: unknown) => {
        assert.ok(err instanceof ParseBotError);
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /PARSE_API_KEY is not configured/);
        return true;
      },
    );
  } finally {
    env.parseBot.apiKey = originalKey;
  }
});

test('SmartprixClient requires slug for getSmartphoneDetails', async () => {
  const client = new SmartprixClient();
  await assert.rejects(
    async () => {
      await client.getSmartphoneDetails({ slug: '' });
    },
    (err: unknown) => {
      assert.ok(err instanceof ParseBotError);
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /slug parameter is required/);
      return true;
    },
  );
});

test('SmartprixClient requires pid for getSmartphonePriceHistory', async () => {
  const client = new SmartprixClient();
  await assert.rejects(
    async () => {
      await client.getSmartphonePriceHistory({ pid: '' });
    },
    (err: unknown) => {
      assert.ok(err instanceof ParseBotError);
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /pid parameter is required/);
      return true;
    },
  );
});
