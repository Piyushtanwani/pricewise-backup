import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.priceHistory.deleteMany();
  await prisma.productStore.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.watchlist.deleteMany();
  await prisma.product.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();

  // Create mock users
  const password = await bcrypt.hash('password123', 10);
  const user1 = await prisma.user.create({
    data: {
      email: 'test@example.com',
      password,
      name: 'Test User',
    },
  });

  // Create stores
  const amazon = await prisma.store.create({
    data: { name: 'Amazon', url: 'https://amazon.in' },
  });
  const flipkart = await prisma.store.create({
    data: { name: 'Flipkart', url: 'https://flipkart.com' },
  });
  const croma = await prisma.store.create({
    data: { name: 'Croma', url: 'https://croma.com' },
  });

  // Create products
  const products = [
    {
      name: 'iPhone 15 Pro Max',
      description: 'Apple iPhone 15 Pro Max, 256GB, Titanium',
      category: 'Electronics',
      brand: 'Apple',
      imageUrl: 'https://m.media-amazon.com/images/I/81+GIkwqLIL._SX679_.jpg',
    },
    {
      name: 'Sony WH-1000XM5',
      description: 'Wireless Noise Canceling Headphones',
      category: 'Audio',
      brand: 'Sony',
      imageUrl: 'https://m.media-amazon.com/images/I/51aXvjzcukL._SX522_.jpg',
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      description: 'AI smartphone with S Pen',
      category: 'Electronics',
      brand: 'Samsung',
      imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?q=80&w=500&auto=format&fit=crop',
    }
  ];

  for (const p of products) {
    const product = await prisma.product.create({ data: p });

    // Link to stores with prices
    const prices = [
      { storeId: amazon.id, basePrice: p.brand === 'Apple' ? 159900 : p.brand === 'Sony' ? 29990 : 129999 },
      { storeId: flipkart.id, basePrice: p.brand === 'Apple' ? 158900 : p.brand === 'Sony' ? 30500 : 130500 },
      { storeId: croma.id, basePrice: p.brand === 'Apple' ? 159900 : p.brand === 'Sony' ? 29990 : 129999 },
    ];

    for (const price of prices) {
      const productStore = await prisma.productStore.create({
        data: {
          productId: product.id,
          storeId: price.storeId,
          productUrl: 'https://example.com/product',
          currentPrice: price.basePrice + (Math.random() * 2000 - 1000), // Random variance
        },
      });

      // Generate 30 days of price history
      for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        await prisma.priceHistory.create({
          data: {
            productStoreId: productStore.id,
            price: price.basePrice + (Math.random() * 5000 - 2500),
            timestamp: date,
          }
        });
      }
    }
  }

  console.log('Seed data inserted successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
