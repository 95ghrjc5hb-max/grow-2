import express from 'express';
import { beginShopifyAuth, handleShopifyCallback } from '../controllers/shopifyController.js';
import { handleMetaCallback } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Meta Authentication Routes
router.get('/meta/callback', handleMetaCallback);

// Shopify Authentication Routes
router.get('/shopify', beginShopifyAuth);
router.get('/shopify/callback', authenticateToken, handleShopifyCallback);

export default router;