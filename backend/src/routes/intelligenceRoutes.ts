import { Router } from 'express';
import { getPriceIntelligence, getMarketIntelligence, getAIAssistantChat } from '../controllers/intelligenceController';

const router = Router();

router.get('/market', getMarketIntelligence);
router.get('/price', getPriceIntelligence);
router.post('/ai', getAIAssistantChat);

export default router;
