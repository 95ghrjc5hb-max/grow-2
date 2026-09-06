import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { createCheckoutSession } from '../controllers/lemonSqueezyController.js';

const router = express.Router();

router.post('/create-checkout', authenticateToken, createCheckoutSession);

export default router;