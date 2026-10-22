import dotenv from 'dotenv';

dotenv.config();

const str = (key: string, fallback = ''): string => (process.env[key] ?? fallback).trim();

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${key} must be a number (received "${raw}")`);
  }
  return value;
};

const jwtSecret = str('JWT_SECRET', 'pricewise-dev-secret-key-32chars-min-length-12345');
if (!process.env.JWT_SECRET) {
  console.warn('[Config] Warning: JWT_SECRET not set in environment. Using default fallback.');
}

export const env = {
  port: num('PORT', 5000),
  nodeEnv: str('NODE_ENV', 'development'),
  corsOrigins: str('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  jwtSecret,
  jwtExpiresIn: str('JWT_EXPIRES_IN', '1d'),
  adminApiKey: str('ADMIN_API_KEY'),

  mlServiceUrl: str('ML_SERVICE_URL').replace(/\/+$/, ''),

  priceSyncIntervalMinutes: num('PRICE_SYNC_INTERVAL_MINUTES', 0),
  priceDropThresholdPercent: num('PRICE_DROP_THRESHOLD_PERCENT', 5),

  amazon: {
    clientId: str('AMAZON_CREATORS_CLIENT_ID'),
    clientSecret: str('AMAZON_CREATORS_CLIENT_SECRET'),
    partnerTag: str('AMAZON_PARTNER_TAG'),
    marketplace: str('AMAZON_MARKETPLACE', 'www.amazon.in'),
    tokenUrl: str('AMAZON_TOKEN_URL', 'https://api.amazon.co.uk/auth/o2/token'),
    baseUrl: str('AMAZON_CREATORS_API_BASE_URL', 'https://creatorsapi.amazon').replace(/\/+$/, ''),
  },

  flipkart: {
    affiliateId: str('FLIPKART_AFFILIATE_ID'),
    affiliateToken: str('FLIPKART_AFFILIATE_TOKEN'),
    baseUrl: str('FLIPKART_API_BASE_URL', 'https://affiliate-api.flipkart.net/affiliate/1.0').replace(/\/+$/, ''),
  },

  parseBot: {
    apiKey: str('PARSE_API_KEY'),
    baseUrl: str('PARSE_BASE_URL', 'https://api.parse.bot').replace(/\/+$/, ''),
    scraperId: str('PARSE_SMARTPRIX_SCRAPER_ID', '37d36dc7-0edf-44d4-8099-976c2da8a33e'),
    snapshotVersion: str('PARSE_SNAPSHOT_VERSION', '8'),
  },

  groq: {
    apiKey: str('GROQ_API_KEY'),
    model: str('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  },

  email: {
    user: str('GMAIL_USER', ''),
    pass: str('GMAIL_APP_PASS') || str('GMAIL_APP_PASSWORD', ''),
  },

  serpApiKey: str('SERPAPI_API_KEY') || str('SERPAPI_KEY', ''),
  google: {
    clientId: str('GOOGLE_CLIENT_ID') || str('Client_ID', ''),
    clientSecret: str('GOOGLE_CLIENT_SECRET') || str('Client_secret', ''),
  },
};

