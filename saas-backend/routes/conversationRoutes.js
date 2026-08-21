import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { getConversations, toggleAiState } from '../controllers/conversationController.js';

const router = express.Router();

// Fetch all conversations
router.get('/', authenticateToken, getConversations);

// Toggle AI state (Pause/Resume) for a specific conversation
router.patch('/:id/ai-toggle', authenticateToken, toggleAiState);

export default router;