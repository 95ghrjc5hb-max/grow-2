import express from 'express';
import { createTemplate, getTemplates } from '../controllers/whatsappTemplateController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/create', createTemplate);
router.get('/list', getTemplates);

export default router;