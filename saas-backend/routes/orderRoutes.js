import express from 'express';
import { getOrders, updateOrderStatus, updateOrder } from '../controllers/orderController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, getOrders);
router.patch('/:id', authenticateToken, updateOrderStatus);
router.put('/:id', authenticateToken, updateOrder); // 👈 Edit Order Save Changes

export default router;