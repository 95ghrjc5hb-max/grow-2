import supabase from '../config/supabase.js';

export const handleMetaCallback = async (req, res) => {
  try {
    const { code, state } = req.query; // 'state' carries the platform key ('messenger' or 'instagram')
    const userId = req.user?.id;

    if (!code || !userId) {
      return res.status(400).json({ error: "Missing OAuth code or user session" });
    }

    // 1. Exchange short-lived code for long-lived Access Token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}&client_secret=${process.env.META_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error("Failed to retrieve access token from Meta API");
    }

    // 2. Fetch User's Connected Facebook Page Details
    const pageResponse = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${tokenData.access_token}`
    );
    const pageData = await pageResponse.json();
    const connectedPage = pageData.data?.[0]; // Get first connected page

    // 3. Save User A / User B Token to Supabase Multi-tenant Table
    const { error } = await supabase
      .from('integrations')
      .upsert({
        user_id: userId,
        platform: state || 'messenger',
        account_name: connectedPage?.name || 'Connected Account',
        access_token: connectedPage?.access_token || tokenData.access_token,
        metadata: { page_id: connectedPage?.id },
        status: 'connected',
        updated_at: new Date()
      }, { onConflict: 'user_id, platform' });

    if (error) throw error;

    // 4. Close popup window and notify frontend UI
    return res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ status: 'success' }, '*');
          window.close();
        }
      </script>
    `);
  } catch (error) {
    console.error('[META OAUTH CALLBACK ERROR]:', error.message);
    return res.status(500).send("Authentication failed. Please try again.");
  }
};
