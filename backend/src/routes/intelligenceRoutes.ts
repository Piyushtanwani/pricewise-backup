import { Router } from 'express';
import { getPriceIntelligence, getAIAssistantChat } from '../controllers/intelligenceController';

const router = Router();

router.get('/price', getPriceIntelligence);
router.post('/ai', getAIAssistantChat);

export default router;
