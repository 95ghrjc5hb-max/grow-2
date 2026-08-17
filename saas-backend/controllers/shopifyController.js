import supabase from '../config/supabase.js';

// 1. Begin Shopify OAuth Flow
export const beginShopifyAuth = (req, res) => {
  const { shop } = req.query;
  if (!shop) {
    return res.status(400).send("Missing shop parameter.");
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES || "read_products,read_orders,write_orders";
  const redirectUri = `${process.env.HOST}/api/auth/shopify/callback`;

  const shopifyAuthUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return res.redirect(shopifyAuthUrl);
};

// 2. Handle Shopify OAuth Callback and Save Token for Logged-In User
export const handleShopifyCallback = async (req, res) => {
  try {
    const { shop, code } = req.query;
    const orgId = req.user?.id || req.user?.userId || req.user?.org_id;

    if (!shop || !code) {
      return res.status(400).send("Invalid callback parameters from Shopify.");
    }

    // Exchange authorization code for permanent access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error("Failed to obtain Shopify access token.");
    }

    // Upsert integration record into Supabase for this specific user
    await supabase
  .from('integrations')
  .upsert({
    org_id: orgId,
    platform: 'shopify',
    account_name: shop,
    access_token: tokenData.access_token,
    metadata: { shop_domain: shop, scope: tokenData.scope },
    status: 'connected',
    updated_at: new Date()
  }, { onConflict: 'org_id, platform' });
    if (error) throw error;

    // Redirect user back to the frontend integrations page
    return res.redirect(`${process.env.FRONTEND_URL}/integrations`);
  } catch (error) {
    console.error("[SHOPIFY OAUTH CALLBACK ERROR]:", error.message);
    return res.status(500).send("Shopify authentication failed.");
  }
};
