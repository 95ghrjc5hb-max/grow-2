import express from 'express';
import { verifyWebhook, handleIncomingWebhook } from '../controllers/webhookController.js';

const router = express.Router();

router.get('/', verifyWebhook);
router.post('/', handleIncomingWebhook);

export default router;
