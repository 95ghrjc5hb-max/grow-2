import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { createCheckoutSession, handleLemonSqueezyWebhook } from '../controllers/lemonSqueezyController.js';

const router = express.Router();

router.post('/create-checkout', authenticateToken, createCheckoutSession);

// Webhook handling routes
router.post('/lemon-squeezy-webhook', handleLemonSqueezyWebhook);
router.post('/webhook', handleLemonSqueezyWebhook);

export default router;