const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/config', authMiddleware, botController.getBotConfig);
router.post('/config', authMiddleware, botController.saveBotConfig);

module.exports = router;
