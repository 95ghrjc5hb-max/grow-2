import express from 'express';

const router = express.Router();

// Auth verify fallback
router.get('/me', (req, res) => {
  res.status(200).json({ success: true, user: req.user || null });
});

export default router;
