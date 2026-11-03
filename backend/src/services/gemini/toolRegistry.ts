import type { FunctionDeclaration } from '@google/genai';

export const GEMINI_TOOLS: FunctionDeclaration[] = [
  {
    name: 'search_products',
    description: 'Search the PriceWise catalogue by keyword, brand, category, or budget constraints.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        query: {
          type: 'STRING' as any,
          description: 'Product name or search keywords (e.g. "OnePlus 12R", "5G phone 12GB RAM", "MacBook Air").',
        },
        category: {
          type: 'STRING' as any,
          description: 'Filter by category (e.g. "Mobiles", "Laptops", "Headphones", "Televisions").',
        },
        brand: {
          type: 'STRING' as any,
          description: 'Filter by brand (e.g. "Samsung", "Apple", "OnePlus", "Xiaomi", "Motorola").',
        },
        maxBudget: {
          type: 'NUMBER' as any,
          description: 'Maximum price in Indian Rupees (INR).',
        },
        minBudget: {
          type: 'NUMBER' as any,
          description: 'Minimum price in Indian Rupees (INR).',
        },
        limit: {
          type: 'INTEGER' as any,
          description: 'Maximum number of items to return (default 5, max 10).',
        },
      },
    },
  },
  {
    name: 'get_product_details',
    description: 'Retrieve detailed technical specifications, full specs, ratings, and best current price for a specific product by its ID or exact name.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: {
          type: 'STRING' as any,
          description: 'The unique ID of the product.',
        },
        productName: {
          type: 'STRING' as any,
          description: 'The name of the product if ID is unknown.',
        },
      },
    },
  },
  {
    name: 'get_category_information',
    description: 'Retrieve the list of supported product categories and brands currently indexed in the PriceWise catalogue.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {},
    },
  },
  {
    name: 'compare_products',
    description: 'Compare 2 to 4 products side-by-side on technical specifications, pricing, store availability, ratings, and value scores.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productIds: {
          type: 'ARRAY' as any,
          items: { type: 'STRING' as any },
          description: 'List of product IDs to compare.',
        },
        productNames: {
          type: 'ARRAY' as any,
          items: { type: 'STRING' as any },
          description: 'List of product names to compare if IDs are not known.',
        },
      },
    },
  },
  {
    name: 'get_best_deals',
    description: 'Find products currently on highest discount below MRP with strong ratings and positive price drop signals.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        category: {
          type: 'STRING' as any,
          description: 'Optional category filter.',
        },
        maxBudget: {
          type: 'NUMBER' as any,
          description: 'Optional maximum price in INR.',
        },
        limit: {
          type: 'INTEGER' as any,
          description: 'Number of deals to return (default 5).',
        },
      },
    },
  },
  {
    name: 'get_store_prices',
    description: 'Get all retailer prices for a product (Amazon, Flipkart, Croma, Vijay Sales, etc.), including stock, delivery, and store URLs.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: {
          type: 'STRING' as any,
          description: 'Product unique ID.',
        },
        productName: {
          type: 'STRING' as any,
          description: 'Product name.',
        },
      },
    },
  },
  {
    name: 'get_price_history',
    description: 'Retrieve daily historical price records, 30-day/90-day price trend, all-time lowest price, and price stability metrics.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: {
          type: 'STRING' as any,
          description: 'Product unique ID.',
        },
        productName: {
          type: 'STRING' as any,
          description: 'Product name.',
        },
        days: {
          type: 'INTEGER' as any,
          description: 'Number of days of history to inspect (e.g. 30, 90, 180, 365). Default is 90.',
        },
      },
    },
  },
  {
    name: 'get_price_prediction',
    description: 'Retrieve 30-day forecast and price drop confidence from PriceWise hybrid Prophet + XGBoost machine learning model. Never fabricated.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: {
          type: 'STRING' as any,
          description: 'Product unique ID.',
        },
        productName: {
          type: 'STRING' as any,
          description: 'Product name.',
        },
      },
    },
  },
  {
    name: 'get_category_recommendations',
    description: 'Get ranked, explainable product recommendations for a specific budget and shopping priority (e.g. performance, camera, battery, value).',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        category: {
          type: 'STRING' as any,
          description: 'Product category (e.g. "Mobiles", "Laptops").',
        },
        budget: {
          type: 'NUMBER' as any,
          description: 'Target budget in INR.',
        },
        priority: {
          type: 'STRING' as any,
          description: 'Priority: "performance", "camera", "battery", "gaming", "value", or "overall".',
        },
        limit: {
          type: 'INTEGER' as any,
          description: 'Number of recommendations (default 3, max 5).',
        },
      },
      required: ['budget'],
    },
  },
  {
    name: 'get_cheaper_alternatives',
    description: 'Find similar products in the same category that cost less than the target product while maintaining strong specifications and ratings.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: {
          type: 'STRING' as any,
          description: 'Product unique ID.',
        },
        productName: {
          type: 'STRING' as any,
          description: 'Product name.',
        },
        maxBudget: {
          type: 'NUMBER' as any,
          description: 'Upper price bound in INR.',
        },
      },
    },
  },
  {
    name: 'get_product_reviews_summary',
    description: 'Retrieve verified user ratings, review count, and sentiment indicators for a product from the PriceWise catalogue.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: {
          type: 'STRING' as any,
          description: 'Product unique ID.',
        },
        productName: {
          type: 'STRING' as any,
          description: 'Product name.',
        },
      },
    },
  },
];

