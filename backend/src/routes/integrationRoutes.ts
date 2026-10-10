import { Router } from 'express';
import {
  getPublicStatus,
  getAdminStatus,
  runSync,
  runImport,
  liveSearch,
  linkListing,
  listListings,
  scrapeAndStore,
} from '../controllers/integrationController';
import { requireAdminKey } from '../middlewares/auth';

export const integrationRouter = Router();
integrationRouter.get('/status', getPublicStatus);
// Development / trigger endpoint
integrationRouter.post('/scrape', scrapeAndStore);

// Operator-only endpoints: they spend store API quota and write catalogue data.
export const adminRouter = Router();
adminRouter.use(requireAdminKey);
adminRouter.get('/integrations', getAdminStatus);
adminRouter.post('/sync', runSync);
adminRouter.post('/import', runImport);
adminRouter.post('/scrape', scrapeAndStore);
adminRouter.get('/live-search', liveSearch);
adminRouter.get('/listings', listListings);
adminRouter.patch('/listings/:listingId', linkListing);
