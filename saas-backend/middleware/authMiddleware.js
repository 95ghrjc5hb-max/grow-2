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

    // 1. Fetch User's Real Organization ID from organization_members
    let activeOrgId = user.app_metadata?.org_id || user.user_metadata?.org_id;

    if (!activeOrgId) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      activeOrgId = member?.org_id || null;
    }

    // Fallback: Check profiles table
    if (!activeOrgId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      activeOrgId = profile?.org_id || null;
    }

    // Attach verified user payload & real org_id to request
    req.user = {
      id: user.id,
      email: user.email,
      org_id: activeOrgId
    };
    req.orgId = activeOrgId; // Clean Enterprise Tenant Access

    console.log(`[AUTH] User: ${user.id} -> Attached Org: ${activeOrgId}`);
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