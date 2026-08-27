import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, category, brand } = req.query;

    const where: any = {};
    
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' };
    }
    if (category) {
      where.category = String(category);
    }
    if (brand) {
      where.brand = String(brand);
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        stores: {
          include: {
            store: true,
          }
        }
      }
    });

    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stores: {
          include: {
            store: true,
            priceHistory: {
              orderBy: { timestamp: 'desc' },
              take: 30 // Last 30 price points
            }
          }
        }
      }
    });

    if (!product) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getCategoriesAndBrands = async (req: Request, res: Response): Promise<void> => {
    try {
        const categories = await prisma.product.findMany({
            select: { category: true },
            distinct: ['category'],
        });
        
        const brands = await prisma.product.findMany({
            select: { brand: true },
            distinct: ['brand'],
        });

        res.json({
            categories: categories.map(c => c.category),
            brands: brands.map(b => b.brand)
        });
    } catch (error) {
        console.error('Error fetching categories and brands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
