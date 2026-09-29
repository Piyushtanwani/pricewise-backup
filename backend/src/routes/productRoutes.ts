import { Router } from 'express';
import {
  listProducts,
  getCatalogMeta,
  getProduct,
  getProductHistory,
  getProductPrediction,
  getAlternatives,
  compareProducts,
} from '../controllers/productController';
import { optionalAuth } from '../middlewares/auth';

const router = Router();

router.get('/', listProducts);
router.get('/meta', getCatalogMeta);
router.get('/compare', compareProducts);
router.get('/:id', optionalAuth, getProduct);
router.get('/:id/history', getProductHistory);
router.get('/:id/prediction', getProductPrediction);
router.get('/:id/alternatives', getAlternatives);

export default router;
