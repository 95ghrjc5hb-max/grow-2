import supabase from '../config/supabase.js';

// 🔗 Handle Meta OAuth Callback
export const handleMetaCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing OAuth code or state parameters from Meta');
    }

    // 1. Extract platform and frontend token securely passed via the 'state' parameter
    const [platform, frontendToken] = decodeURIComponent(state).split('___');

    if (!frontendToken) {
      throw new Error('User authentication token is missing from the state parameter');
    }

    // 2. Decode the Supabase JWT token manually to extract the user's org_id
    const tokenParts = frontendToken.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid JWT Token Format');
    }

    // Parse the payload (middle part of the JWT)
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    const orgId = payload.sub; // This is the unique user/org ID in Supabase

    if (!orgId) {
      throw new Error('User ID could not be extracted from the token');
    }

    // 3. Exchange the short-lived code for a long-lived Access Token from Meta
    const redirectUri = `${process.env.FRONTEND_URL}/api/auth/meta/callback`;
    const tokenResponse = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.META_APP_SECRET}&code=${code}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
       throw new Error(tokenData.error.message);
    }

    if (!tokenData.access_token) {
      throw new Error('Failed to retrieve access token from Meta Graph API');
    }

    // 🔥 NEW ADDITION:
    const pageResponse = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${tokenData.access_token}`);
    const pageData = await pageResponse.json();
    
    if (!pageData.data || pageData.data.length === 0) {
      throw new Error('No Facebook Page found connected to this account.');
    }
    
    const connectedPage = pageData.data[0]; 
    // Auto-subscribe the page to webhooks via Meta Graph API
    try {
      const subscribeUrl = `https://graph.facebook.com/v20.0/${connectedPage.id}/subscribed_apps?access_token=${connectedPage.access_token}`;
      const subscribeRes = await fetch(subscribeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribed_fields: 'messages,messaging_postbacks'
        })
      });
      const subscribeData = await subscribeRes.json();
      console.log('Auto-subscribe response:', subscribeData);
    } catch (subError) {
      console.error('Failed to auto-subscribe page to webhook:', subError);
    }

    // 4. Save the verified PAGE token & PAGE ID to the Supabase database
    const { error } = await supabase
      .from('integrations')
      .upsert({
        org_id: orgId,
        platform: platform,
        page_id: connectedPage.id, // 🔥 Saving Page ID
        access_token: connectedPage.access_token, // 🔥 Saving Permanent Page Token!
        status: 'connected',
        updated_at: new Date()
      }, { onConflict: 'org_id, platform' });

    if (error) throw error;

    // 5. Close the popup window and notify the React frontend to update the UI
    const htmlResponse = `
      <html>
        <body>
          <script>
            window.opener.postMessage({ status: "success" }, "*");
            window.close();
          </script>
        </body>
      </html>
    `;
    return res.status(200).send(htmlResponse);

  } catch (error) {
    console.error('[META CALLBACK ERROR]:', error.message);
    const htmlResponse = `
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2 style="color: red;">Authentication Failed!</h2>
          <p>${error.message}</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `;
    return res.status(500).send(htmlResponse);
  }
};