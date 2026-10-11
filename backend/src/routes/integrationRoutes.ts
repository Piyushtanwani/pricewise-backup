import { Router } from 'express';
import {
  getPublicStatus,
  getAdminStatus,
  runSync,
  runImport,
  liveSearch,
  linkListing,
  listListings,
  getSmartprixStatus,
  smartprixSearch,
  smartprixDetails,
  smartprixPriceHistory,
  smartprixBrands,
  smartprixNormalize,
} from '../controllers/integrationController';
import { requireAdminKey } from '../middlewares/auth';

export const integrationRouter = Router();
integrationRouter.get('/status', getPublicStatus);
integrationRouter.get('/smartprix/status', getSmartprixStatus);
integrationRouter.get('/smartprix/search', smartprixSearch);
integrationRouter.get('/smartprix/details', smartprixDetails);
integrationRouter.get('/smartprix/price-history', smartprixPriceHistory);
integrationRouter.get('/smartprix/brands', smartprixBrands);
integrationRouter.post('/smartprix/normalize', smartprixNormalize);

// Operator-only endpoints: they spend store API quota and write catalogue data.
export const adminRouter = Router();
adminRouter.use(requireAdminKey);
adminRouter.get('/integrations', getAdminStatus);
adminRouter.post('/sync', runSync);
adminRouter.post('/import', runImport);
adminRouter.get('/live-search', liveSearch);
adminRouter.get('/listings', listListings);
adminRouter.patch('/listings/:listingId', linkListing);
adminRouter.get('/smartprix/search', smartprixSearch);
adminRouter.get('/smartprix/details', smartprixDetails);
adminRouter.get('/smartprix/price-history', smartprixPriceHistory);
adminRouter.get('/smartprix/brands', smartprixBrands);
adminRouter.post('/smartprix/normalize', smartprixNormalize);

