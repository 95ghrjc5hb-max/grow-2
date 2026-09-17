import { supabase } from '../config/supabase.js';
import crypto from 'crypto';

export const authenticateToken = async (req, res, next) => {
  // 1. BYPASS LOGIC: Allow Shopify callback to pass without a token header
  if (req.originalUrl && req.originalUrl.includes('/shopify/callback')) {
    return next();
  }

  // 2. Authentication Logic
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token === 'undefined' || token === 'null') {
      return res.status(401).json({
        success: false,
        error: 'Authorization token missing.'
      });
    }

    // Cryptographically verify token using Supabase Auth Engine
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Token verification failed:", authError?.message);
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session token."
      });
    }

    // Attach verified user payload to request
    req.user = {
      id: user.id,
      email: user.email,
      org_id: user.app_metadata?.org_id || user.user_metadata?.org_id || user.id
    };

    console.log("Token Accepted! User ID:", req.user.id);
    return next();
  } catch (err) {
    console.error("Token Process Error:", err.message);
    return res.status(401).json({
      success: false,
      error: "Malformed authentication token."
    });
  }
};

export const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;

  if (!hmacHeader || !secret) {
    return res.status(401).json({ success: false, error: 'Unauthorized webhook request' });
  }

  const generatedHash = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody || JSON.stringify(req.body), 'utf8')
    .digest('base64');

  if (crypto.timingSafeEqual(Buffer.from(generatedHash), Buffer.from(hmacHeader))) {
    return next();
  }

  return res.status(401).json({ success: false, error: 'HMAC verification failed' });
};