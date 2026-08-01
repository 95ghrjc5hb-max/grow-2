import express from 'express';
import { getOrders, updateOrderStatus } from '../controllers/orderController.js';

const router = express.Router();

router.get('/', getOrders);
router.patch('/:id', updateOrderStatus);

export default router;
