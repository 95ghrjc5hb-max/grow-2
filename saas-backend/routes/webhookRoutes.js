import express from 'express';
import {
  verifyMetaWebhook,
  handleMetaWebhook,
  handleCustomerDataRequest,
  handleCustomerRedact,
  handleShopRedact
} from '../controllers/webhookController.js';
import { verifyShopifyWebhook } from '../middleware/authMiddleware.js';

const router = express.Router();

// Meta / WhatsApp / Messenger Webhooks
router.get('/messenger', verifyMetaWebhook);
router.post('/messenger', handleMetaWebhook);

// Shopify Mandatory GDPR Webhooks (Secured with HMAC)
router.post('/shopify/customers/data_request', verifyShopifyWebhook, handleCustomerDataRequest);
router.post('/shopify/customers/redact', verifyShopifyWebhook, handleCustomerRedact);
router.post('/shopify/shop/redact', verifyShopifyWebhook, handleShopRedact);

export default router;