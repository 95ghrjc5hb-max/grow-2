import express from 'express';
import { 
  getIntegrations, 
  saveWhatsAppIntegration, 
  disconnectIntegration 
} from '../controllers/integrationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all integration endpoints with Auth Middleware
router.use(authenticateToken);

// GET user specific integrations
router.get('/', getIntegrations);

// POST save WhatsApp credentials for specific user
router.post('/whatsapp', saveWhatsAppIntegration);

// DELETE disconnect specific platform for user
router.delete('/:platform', disconnectIntegration);

export default router;
