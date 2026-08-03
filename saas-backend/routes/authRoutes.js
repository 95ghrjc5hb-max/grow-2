import express from 'express';
import { beginShopifyAuth, handleShopifyCallback } from '../controllers/shopifyController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Shopify Authentication Routes
router.get('/shopify', beginShopifyAuth);
router.get('/shopify/callback', authenticateToken, handleShopifyCallback);

export default router;
