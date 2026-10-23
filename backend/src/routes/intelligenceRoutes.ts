import { Router } from 'express';
import { getPriceIntelligence, getMarketIntelligence, getAIAssistantChat } from '../controllers/intelligenceController';
import { optionalAuth } from '../middlewares/auth';

const router = Router();

router.get('/market', getMarketIntelligence);
router.get('/price', getPriceIntelligence);
router.post('/ai', optionalAuth, getAIAssistantChat);

export default router;
