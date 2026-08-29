import express from 'express';
import { beginShopifyAuth, handleShopifyCallback } from '../controllers/shopifyController.js';
// Ekhane authMiddleware konobhabei import ba use kora jabe na callback er jonno!

const router = express.Router();

// 1. Endpoint triggered by the frontend 'Connect' button
// URL: /api/auth/shopify?shop=...&token=...
router.get('/', beginShopifyAuth);

// 2. Callback URL where Shopify redirects the user after granting permissions
// URL: /api/auth/shopify/callback?code=...&shop=...&state=...
router.get('/callback', handleShopifyCallback);

export default router;