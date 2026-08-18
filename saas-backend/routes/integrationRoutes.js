import express from 'express';
import {
  getIntegrations,
  connectWhatsApp,
  connectWhatsAppOAuth,
  disconnectIntegration
} from '../controllers/integrationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, getIntegrations);
router.post('/whatsapp', authenticateToken, connectWhatsApp);
router.post('/whatsapp/oauth', authenticateToken, connectWhatsAppOAuth);
router.delete('/:platform', authenticateToken, disconnectIntegration);

export default router;