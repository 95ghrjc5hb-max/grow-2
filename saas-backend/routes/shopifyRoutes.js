import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js'; 
import {
  beginShopifyAuth,
  handleShopifyCallback,
  handleStorefrontChat,
  handleShopifyWebhook,
  handleShopifyBillingCallback,      
  createShopifyBillingSubscription   
} from '../controllers/shopifyController.js';

const router = express.Router();

// ---------------------------------------------------------
// 1. SHOPIFY APP INSTALLATION & OAUTH ROUTES (RESTORED)
// ---------------------------------------------------------
// Route: GET /api/shopify/auth
router.get('/auth', beginShopifyAuth);

// Route: GET /api/shopify/callback
router.get('/callback', handleShopifyCallback);

// ---------------------------------------------------------
// 2. PUBLIC STOREFRONT CHAT WIDGET ROUTE (NEW)
// ---------------------------------------------------------
// Route: POST /api/shopify/chat
router.post('/chat', handleStorefrontChat);

// Route: POST /api/shopify/webhook
router.post('/webhook', handleShopifyWebhook);

// ---------------------------------------------------------
// 3. SHOPIFY BILLING ROUTES (NEW)
// ---------------------------------------------------------
// Route: GET /api/shopify/billing/callback
// Shopify redirects to this URL after payment approval
router.get('/billing/callback', handleShopifyBillingCallback);

// Route: POST /api/shopify/billing/subscribe
// Frontend triggers this endpoint when a user clicks the subscribe button
router.post('/billing/subscribe', authenticateToken, createShopifyBillingSubscription);

export default router;