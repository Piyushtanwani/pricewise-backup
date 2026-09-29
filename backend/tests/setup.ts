// Lets modules that read config load without a real .env (tests never call external services).
process.env.JWT_SECRET ??= 'test-only-secret';
