/**
 * Development seed. Mirrors frontend/src/data/mockData.ts so pages look the same once they
 * switch from mock data to the API. WARNING: wipes all existing rows first.
 *
 * Seeded listings have no externalId (ASIN/FSN), so the store price sync leaves them alone.
 * Use `npm run sync` after linking listings via PATCH /api/admin/listings/:id or importing
 * real products via POST /api/admin/import.
 */
import bcrypt from 'bcryptjs';
import { NotificationType, StockStatus } from '../src/generated/prisma';
import prisma from '../src/utils/prisma';
import { refreshProductAggregates } from '../src/services/productService';
import { DEFAULT_NOTIFICATION_PREFS } from '../src/services/notificationPrefs';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 365;

const STORES = [
  { key: 'amazon', name: 'Amazon', url: 'https://www.amazon.in', search: (q: string) => `https://www.amazon.in/s?k=${q}` },
  { key: 'flipkart', name: 'Flipkart', url: 'https://www.flipkart.com', search: (q: string) => `https://www.flipkart.com/search?q=${q}` },
  { key: 'croma', name: 'Croma', url: 'https://www.croma.com', search: (q: string) => `https://www.croma.com/searchB?q=${q}` },
  { key: 'vijay-sales', name: 'Vijay Sales', url: 'https://www.vijaysales.com', search: (q: string) => `https://www.vijaysales.com/search?q=${q}` },
  { key: 'samsung', name: 'Samsung', url: 'https://www.samsung.com/in', search: (q: string) => `https://www.samsung.com/in/search/?searchvalue=${q}` },
] as const;

type StoreKey = (typeof STORES)[number]['key'];

interface SeedListing {
  store: StoreKey;
  price: number;
  shipping?: number;
  stock?: StockStatus;
}

interface SeedProduct {
  key: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
  mrp: number;
  rating: number;
  reviewCount: number;
  specs: string[];
  techSpecs: Record<string, string>;
  // Best price over roughly the last 90 days, oldest first (mockData priceHistory)
  trend: number[];
  listings: SeedListing[];
}

const PRODUCTS: SeedProduct[] = [
  {
    key: 'sony-xm5',
    brand: 'Sony',
    name: 'WH-1000XM5 Wireless Noise Cancelling Headphones',
    category: 'Headphones',
    description: 'Industry-leading noise cancellation with two processors, eight microphones and up to 30 hours of battery life.',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop&auto=format',
    mrp: 34990,
    rating: 4.7,
    reviewCount: 12840,
    specs: ['30hr battery', 'ANC', 'LDAC', 'Multipoint'],
    techSpecs: {
      Driver: '30 mm',
      Battery: 'Up to 30 hours',
      'Noise Cancellation': 'Adaptive ANC',
      Codecs: 'SBC, AAC, LDAC',
      Connectivity: 'Bluetooth 5.2, multipoint',
      Weight: '250 g',
      Warranty: '1 Year',
    },
    trend: [34990, 32999, 31500, 33000, 30999, 29999, 29999],
    listings: [
      { store: 'amazon', price: 29999 },
      { store: 'flipkart', price: 30499 },
      { store: 'croma', price: 31990, shipping: 99 },
      { store: 'vijay-sales', price: 32500, stock: 'LIMITED' },
    ],
  },
  {
    key: 'iphone-16-pro-max',
    brand: 'Apple',
    name: 'iPhone 16 Pro Max 256GB Natural Titanium',
    category: 'Mobiles',
    description: 'A18 Pro chip, 6.9-inch Super Retina XDR display and a 5x telephoto camera in a titanium design.',
    imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&h=400&fit=crop&auto=format',
    mrp: 144900,
    rating: 4.8,
    reviewCount: 34200,
    specs: ['A18 Pro', '6.9" OLED', '5x Zoom', 'Titanium'],
    techSpecs: {
      Processor: 'A18 Pro (Apple)',
      RAM: '8 GB',
      Storage: '256 GB',
      Display: '6.9" OLED 120Hz',
      Camera: '48 MP Main',
      Battery: '4685 mAh',
      Weight: '227 g',
      Warranty: '1 Year',
    },
    trend: [144900, 142000, 139900, 138000, 136000, 135500, 134900],
    listings: [
      { store: 'flipkart', price: 134900 },
      { store: 'amazon', price: 135900 },
      { store: 'croma', price: 136990 },
      { store: 'vijay-sales', price: 137490 },
      { store: 'samsung', price: 139900, stock: 'LIMITED' },
    ],
  },
  {
    key: 'macbook-air-m3',
    brand: 'Apple',
    name: 'MacBook Air M3 13" 8GB 256GB Midnight',
    category: 'Laptops',
    description: 'Apple M3 chip with an 8-core CPU, 13.6-inch Liquid Retina display and up to 18 hours of battery life.',
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop&auto=format',
    mrp: 114900,
    rating: 4.9,
    reviewCount: 8960,
    specs: ['M3 chip', '13" Liquid Retina', '18hr battery', 'MagSafe'],
    techSpecs: {
      Processor: 'Apple M3, 8-core CPU',
      RAM: '8 GB',
      Storage: '256 GB SSD',
      Display: '13.6" Liquid Retina',
      Battery: 'Up to 18 hours',
      Weight: '1.24 kg',
      Warranty: '1 Year',
    },
    trend: [114900, 112000, 108000, 104000, 101000, 100000, 99900],
    listings: [
      { store: 'amazon', price: 99900 },
      { store: 'flipkart', price: 100990 },
      { store: 'croma', price: 102900 },
    ],
  },
  {
    key: 'galaxy-s25-ultra',
    brand: 'Samsung',
    name: 'Galaxy S25 Ultra 256GB Titanium Black',
    category: 'Mobiles',
    description: 'Snapdragon 8 Elite for Galaxy, 200 MP camera, built-in S Pen and a 6.9-inch Dynamic AMOLED display.',
    imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=400&h=400&fit=crop&auto=format',
    mrp: 134999,
    rating: 4.6,
    reviewCount: 21300,
    specs: ['Snapdragon 8 Elite', '6.9" AMOLED', '200MP', 'S Pen'],
    techSpecs: {
      Processor: 'Snapdragon 8 Elite',
      RAM: '12 GB',
      Storage: '256 GB',
      Display: '6.9" AMOLED 120Hz',
      Camera: '200 MP Main',
      Battery: '5000 mAh',
      Weight: '218 g',
      Warranty: '1 Year',
    },
    trend: [134999, 130000, 128000, 126000, 127000, 125999, 124999],
    listings: [
      { store: 'samsung', price: 124999 },
      { store: 'amazon', price: 125999 },
      { store: 'flipkart', price: 126499 },
      { store: 'croma', price: 127990 },
    ],
  },
  {
    key: 'lg-c3-55',
    brand: 'LG',
    name: '55" C3 OLED evo 4K Smart TV',
    category: 'Televisions',
    description: 'Self-lit OLED evo panel with 4K 120 Hz, Dolby Vision and Dolby Atmos, running webOS.',
    imageUrl: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=400&h=400&fit=crop&auto=format',
    mrp: 129990,
    rating: 4.8,
    reviewCount: 5420,
    specs: ['OLED evo', '4K 120Hz', 'Dolby Vision', 'webOS'],
    techSpecs: {
      Panel: 'OLED evo',
      Resolution: '4K UHD (3840 x 2160)',
      'Refresh Rate': '120 Hz',
      HDR: 'Dolby Vision, HDR10, HLG',
      Audio: '40 W, Dolby Atmos',
      'Smart OS': 'webOS',
      Warranty: '1 Year',
    },
    trend: [129990, 119990, 109990, 99990, 89990, 82990, 79990],
    listings: [
      { store: 'croma', price: 79990 },
      { store: 'amazon', price: 81990 },
      { store: 'vijay-sales', price: 82490 },
    ],
  },
  {
    key: 'pixel-9-pro',
    brand: 'Google',
    name: 'Pixel 9 Pro 128GB Obsidian',
    category: 'Mobiles',
    description: 'Google Tensor G4, a 6.3-inch Super Actua display and seven years of OS and security updates.',
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop&auto=format',
    mrp: 109999,
    rating: 4.5,
    reviewCount: 7800,
    specs: ['Tensor G4', '6.3" OLED', '50MP Camera', '7yr updates'],
    techSpecs: {
      Processor: 'Tensor G4',
      RAM: '16 GB',
      Storage: '128 GB',
      Display: '6.3" OLED 120Hz',
      Camera: '50 MP Main',
      Battery: '4700 mAh',
      Weight: '199 g',
      Warranty: '1 Year (7 years OS updates)',
    },
    trend: [109999, 104999, 99999, 96000, 92000, 90999, 89999],
    listings: [
      { store: 'flipkart', price: 89999 },
      { store: 'amazon', price: 91499 },
      { store: 'croma', price: 92999 },
    ],
  },
];

/** Deterministic PRNG so every seed run produces the same history. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/**
 * Best-price curve for day `d` days ago: flat-ish near the oldest trend value before 90 days,
 * then linear interpolation through the 7 trend points.
 */
const baseline = (trend: number[], daysAgo: number): number => {
  if (daysAgo >= 90) return trend[0];
  const pos = ((90 - daysAgo) / 90) * (trend.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  return trend[i] + (trend[Math.min(i + 1, trend.length - 1)] - trend[i]) * frac;
};

const roundPrice = (n: number) => Math.max(1, Math.round(n / 10) * 10 - 1);

const main = async () => {
  console.log('Clearing existing data...');
  await prisma.notification.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.watchlist.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.productStore.deleteMany();
  await prisma.product.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();

  const stores = new Map<StoreKey, string>();
  for (const s of STORES) {
    const store = await prisma.store.create({ data: { name: s.name, slug: s.key, url: s.url } });
    stores.set(s.key, store.id);
  }

  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 6));
  const productIds = new Map<string, string>();

  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        brand: p.brand,
        category: p.category,
        description: p.description,
        imageUrl: p.imageUrl,
        mrp: p.mrp,
        rating: p.rating,
        reviewCount: p.reviewCount,
        specs: p.specs,
        techSpecs: p.techSpecs,
      },
    });
    productIds.set(p.key, product.id);
    const best = Math.min(...p.listings.map((l) => l.price));
    const storeDef = (key: StoreKey) => STORES.find((s) => s.key === key)!;

    for (const l of p.listings) {
      const premium = l.price - best;
      const listing = await prisma.productStore.create({
        data: {
          productId: product.id,
          storeId: stores.get(l.store)!,
          productUrl: storeDef(l.store).search(encodeURIComponent(`${p.brand} ${p.name}`)),
          currentPrice: l.price,
          mrp: p.mrp,
          stockStatus: l.stock ?? 'IN_STOCK',
          shippingCost: l.shipping ?? 0,
          lastCheckedAt: today,
        },
      });

      const rand = mulberry32(hash(`${p.key}:${l.store}`));
      const history = [];
      for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
        const noise = (rand() - 0.5) * 0.03 * p.mrp;
        const price = Math.min(p.mrp, roundPrice(baseline(p.trend, daysAgo) + premium + noise));
        history.push({ productStoreId: listing.id, price, timestamp: new Date(today.getTime() - daysAgo * DAY_MS) });
      }
      history.push({ productStoreId: listing.id, price: l.price, timestamp: today });
      await prisma.priceHistory.createMany({ data: history });
    }

    await refreshProductAggregates(product.id);
  }

  // Test account (development only)
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      name: 'Test User',
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    },
  });
  const id = (key: string) => productIds.get(key)!;

  const ago = (ms: number) => new Date(Date.now() - ms);
  await prisma.wishlist.createMany({
    data: [
      { userId: user.id, productId: id('sony-xm5'), addedPrice: 34990, createdAt: ago(60 * DAY_MS) },
      { userId: user.id, productId: id('macbook-air-m3'), addedPrice: 109999, createdAt: ago(45 * DAY_MS) },
      { userId: user.id, productId: id('lg-c3-55'), addedPrice: 89990, createdAt: ago(30 * DAY_MS) },
      { userId: user.id, productId: id('iphone-16-pro-max'), addedPrice: 137800, createdAt: ago(20 * DAY_MS) },
    ],
  });
  await prisma.watchlist.createMany({
    data: [
      { userId: user.id, productId: id('sony-xm5') },
      { userId: user.id, productId: id('macbook-air-m3') },
      { userId: user.id, productId: id('iphone-16-pro-max') },
    ],
  });
  await prisma.alert.createMany({
    data: [
      { userId: user.id, productId: id('sony-xm5'), targetPrice: 27000 },
      { userId: user.id, productId: id('macbook-air-m3'), targetPrice: 95000 },
      { userId: user.id, productId: id('iphone-16-pro-max'), targetPrice: 130000, notifyPush: true },
      // Older alert that already fired before the user lowered the target
      { userId: user.id, productId: id('macbook-air-m3'), targetPrice: 100000, isActive: false, triggeredAt: ago(60 * 60 * 1000) },
    ],
  });

  const notifications: {
    type: NotificationType;
    title: string;
    body: string;
    product?: string;
    prev?: number;
    next?: number;
    target?: number;
    read: boolean;
    at: Date;
  }[] = [
      { type: 'PRICE_DROP', title: 'Price dropped!', body: 'Sony WH-1000XM5 dropped by ₹5,000 — now ₹29,999', product: 'sony-xm5', prev: 34999, next: 29999, read: false, at: ago(2 * 60 * 1000) },
      { type: 'TARGET_REACHED', title: 'Target price reached!', body: 'MacBook Air M3 is now at ₹99,900 — your target was ₹1,00,000', product: 'macbook-air-m3', prev: 109999, next: 99900, target: 100000, read: false, at: ago(60 * 60 * 1000) },
      { type: 'RECOMMENDATION', title: 'New recommendation', body: 'We found a better-value alternative to your tracked Galaxy S25 Ultra', product: 'galaxy-s25-ultra', read: true, at: ago(3 * 60 * 60 * 1000) },
      { type: 'DIGEST', title: 'Weekly price digest', body: '3 products in your wishlist have dropped in price this week', read: true, at: ago(DAY_MS) },
      { type: 'PRICE_DROP', title: 'Price dropped!', body: 'LG 55" C3 OLED dropped by ₹10,000 — now ₹79,990', product: 'lg-c3-55', prev: 89990, next: 79990, target: 75000, read: true, at: ago(4 * DAY_MS) },
    ];
  await prisma.notification.createMany({
    data: notifications.map((n) => ({
      userId: user.id,
      productId: n.product ? id(n.product) : null,
      type: n.type,
      title: n.title,
      body: n.body,
      prevPrice: n.prev ?? null,
      newPrice: n.next ?? null,
      targetPrice: n.target ?? null,
      read: n.read,
      createdAt: n.at,
    })),
  });

  const historyRows = await prisma.priceHistory.count();
  console.log(`Seeded ${PRODUCTS.length} products, ${STORES.length} stores, ${historyRows} price points.`);
  console.log('Test login: test@example.com (password in prisma/seed.ts)');
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
