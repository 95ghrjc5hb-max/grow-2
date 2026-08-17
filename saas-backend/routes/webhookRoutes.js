import express from 'express';
import { verifyMetaWebhook, handleMetaWebhook } from '../controllers/webhookController.js';

const router = express.Router();

router.get('/messenger', verifyMetaWebhook);
router.post('/messenger', handleMetaWebhook);

export default router;