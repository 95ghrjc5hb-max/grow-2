import express from 'express';
import { getProducts, addProduct } from '../controllers/botController.js';

const router = express.Router();

router.get('/products', getProducts);
router.post('/products', addProduct);

export default router;
