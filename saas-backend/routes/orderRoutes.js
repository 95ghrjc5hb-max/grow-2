import express from 'express';
import { getOrders, updateOrderStatus } from '../controllers/orderController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, getOrders);
router.patch('/:id', authenticateToken, updateOrderStatus);

export default router;