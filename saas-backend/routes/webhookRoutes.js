import express from 'express';
import { 
  verifyMetaWebhook, 
  handleMetaWebhook,
  handleCustomerDataRequest,
  handleCustomerRedact,
  handleShopRedact
} from '../controllers/webhookController.js';

const router = express.Router();

// Meta / WhatsApp / Messenger Webhooks
router.get('/messenger', verifyMetaWebhook);
router.post('/messenger', handleMetaWebhook);

// Shopify Mandatory GDPR Webhooks
router.post('/shopify/customers/data_request', handleCustomerDataRequest);
router.post('/shopify/customers/redact', handleCustomerRedact);
router.post('/shopify/shop/redact', handleShopRedact);

export default router;