import express from 'express';
import { getIntegrations } from '../controllers/integrationController.js';

const router = express.Router();

// GET active integrations list
router.get('/', getIntegrations);

export default router;
