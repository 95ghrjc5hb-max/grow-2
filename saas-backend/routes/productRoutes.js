import express from 'express';
import { createProduct, updateProduct } from '../controllers/productController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Now these routes will strictly verify the user's token
router.post('/', authenticateToken, createProduct);
router.put('/:id', authenticateToken, updateProduct);

export default router;