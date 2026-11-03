import { Router } from 'express';
import { getPriceIntelligence, getMarketIntelligence, getAIAssistantChat } from '../controllers/intelligenceController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.get('/market', getMarketIntelligence);
router.get('/price', getPriceIntelligence);
router.post('/ai', authenticateToken, getAIAssistantChat);

export default router;
