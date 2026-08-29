import express from 'express';
import { createCheckoutSession, handleStripeWebhook } from '../controllers/stripeController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// User er jonno checkout link toiri korar route
router.post('/create-checkout', authenticateToken, createCheckoutSession);

// Stripe er webhook receive korar route
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

export default router;