import supabase from '../config/supabase.js';

// 🔗 Handle Meta OAuth Callback
export const handleMetaCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing OAuth code or state parameters from Meta');
    }

    // 1. Extract platform and orgId securely from short state
        const [platform, passedOrgId] = decodeURIComponent(state).split('__');

        if (!passedOrgId || passedOrgId === 'default') {
            throw new Error("Organization ID is missing from state parameter. Please log in again.");
        }

        // Resolve true organization ID from profiles if passedOrgId is a user ID
        let orgId = passedOrgId;

        const { data: userProfile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', passedOrgId)
            .maybeSingle();

        if (userProfile?.org_id) {
            orgId = userProfile.org_id;
        }

    // 3. Exchange the short-lived code for a long-lived Access Token from Meta
   const redirectUri = process.env.META_REDIRECT_URI || 'http://localhost:8080/api/auth/meta/callback';
    const tokenResponse = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.META_APP_SECRET}&code=${code}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
       throw new Error(tokenData.error.message);
    }

    if (!tokenData.access_token) {
      throw new Error('Failed to retrieve access token from Meta Graph API');
    }

   // 1. Check exact permissions granted by Meta
    const permsRes = await fetch(`https://graph.facebook.com/v20.0/me/permissions?access_token=${tokenData.access_token}`);
    const permsData = await permsRes.json();
    console.log("ACTUAL PERMISSIONS GRANTED:", JSON.stringify(permsData.data));

    // 2. Fetch Pages with tasks and fallback
    let pageResponse = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,tasks&access_token=${tokenData.access_token}`);
    let pageData = await pageResponse.json();

    console.log("META PAGE DATA RESPONSE:", JSON.stringify(pageData));

    if (pageData.error) {
      throw new Error(pageData.error.message);
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
   // 5. Allow CSP for inline script, close popup safely and notify React frontend
    res.setHeader(
      "Content-Security-Policy",
      "default-src * 'unsafe-inline'; script-src * 'unsafe-inline';"
    );

    const htmlResponse = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connected to Meta</title>
      </head>
      <body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:#fff;font-family:sans-serif;margin:0;">
        <h2 style="color:#10b981;margin-bottom:8px;">✓ Connected Successfully!</h2>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:20px;">Closing window automatically...</p>
        <button onclick="window.close()" style="background:#2563eb;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-weight:600;cursor:pointer;">
          Close Window
        </button>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({ status: "success" }, "*");
            }
          } catch (e) {}
          setTimeout(function() {
            window.close();
          }, 1000);
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
// ==========================================
// Standalone Instagram Direct Callback (Enterprise Standard)
// ==========================================
export const handleInstagramCallback = async (req, res) => {
    try {
        // Line 145 Replace:
    const { code, state } = req.query;
    const cleanCode = (code || '').replace(/#_.*$/, '').replace(/#$/, '');
        if (!code || !state) {
            return res.status(400).send("Missing OAuth code or state parameter from Instagram.");
        }

        // 1. Extract platform and orgId securely from short state
        const [platform, passedOrgId] = decodeURIComponent(state).split('__');

        if (!passedOrgId || passedOrgId === 'default') {
            throw new Error("Organization ID is missing from state parameter.");
        }

        
       let orgId = passedOrgId;

        // Resolve true organization ID from profiles if passedOrgId is a user ID
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', passedOrgId)
            .maybeSingle();

        if (userProfile?.org_id) {
            orgId = userProfile.org_id;
        }
       const igRedirectUri = process.env.INSTAGRAM_REDIRECT_URI || 'https://api.growcorebot.com/api/auth/instagram/callback';
        const igAppId = process.env.INSTAGRAM_APP_ID; // ✅ এখন এটি ডায়নামিক
        const igAppSecret = process.env.INSTAGRAM_APP_SECRET;
        if (!igAppSecret) {
            throw new Error("INSTAGRAM_APP_SECRET is not configured in server environment.");
        }

        // 1. Exchange auth code for Short-Lived Access Token & User ID
        const formData = new URLSearchParams();
        formData.append('client_id', igAppId);
        formData.append('client_secret', igAppSecret);
        formData.append('grant_type', 'authorization_code');
        formData.append('redirect_uri', igRedirectUri);
        // Line 184 Replace:
    formData.append('code', cleanCode);

        const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
            method: 'POST',
            body: formData
        });
        const tokenData = await tokenRes.json();

        if (tokenData.error_type || !tokenData.access_token) {
            throw new Error(tokenData.error_message || "Failed to exchange Instagram authorization code.");
        }

        const shortLivedToken = tokenData.access_token;
        const instagramUserId = String(tokenData.user_id);

        // 2. Exchange for 60-Day Long-Lived Instagram Token
        const longLivedRes = await fetch(
            `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${igAppSecret}&access_token=${shortLivedToken}`
        );
        const longLivedData = await longLivedRes.json();
        const permanentToken = longLivedData.access_token || shortLivedToken;

        // 3. Auto-Subscribe Instagram Account to Webhooks
       // 3. Auto-Subscribe Instagram Account to Webhooks (Production Standard)
        try {
            const subscribeUrl = `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${permanentToken}`;
            const subRes = await fetch(subscribeUrl, {
                method: 'POST'
            });
            const subData = await subRes.json();
            console.log("INSTAGRAM WEBHOOK AUTO-SUBSCRIBE RESULT:", subData);
        } catch (subErr) {
            console.warn("INSTAGRAM SUBSCRIBE WARNING!:", subErr.message);
        }

        // 4. Fetch Instagram Username & Dynamic Business Account ID
let igUsername = 'Instagram User';
let finalInstagramId = instagramUserId;

try {
    const userRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username,user_id,account_type&access_token=${permanentToken}`);
    const userData = await userRes.json();
    if (userData.username) igUsername = userData.username;
    // userData.user_id hocche real 1784... business ID
    if (userData.user_id) {
        finalInstagramId = String(userData.user_id);
    } else if (userData.id) {
        finalInstagramId = String(userData.id);
    }
} catch (e) {
    console.warn("[OAUTH WARNING] Could not fetch dynamic Instagram profile:", e.message);
}

// 5. Upsert into Supabase integrations
const { error: upsertErr } = await supabase.from('integrations').upsert({
    org_id: orgId,
    platform: 'instagram',
    page_id: finalInstagramId,
    access_token: permanentToken,
    status: 'connected',
    updated_at: new Date()
}, { onConflict: 'org_id, platform' });

        if (upsertErr) throw upsertErr;

        // 6. Return Clean HTML with postMessage
        const htmlSuccess = `
            <!DOCTYPE html>
            <html>
            <head><title>Instagram Connected</title></head>
            <body style="font-family:sans-serif;text-align:center;padding-top:50px;">
                <h2 style="color:#10b981;">Instagram Connected Successfully!</h2>
                <p>Connected account: <b>@${igUsername}</b></p>
                <p>This window will close automatically...</p>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ status: "success", platform: "instagram" }, "*");
                    }
                    setTimeout(() => window.close(), 1200);
                </script>
            </body>
            </html>
        `;
        return res.status(200).send(htmlSuccess);

    } catch (err) {
        console.error("[INSTAGRAM DIRECT AUTH ERROR]:", err.message);
        return res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <body style="font-family:sans-serif;text-align:center;padding-top:50px;">
                <h2 style="color:#ef4444;">Instagram Connection Failed</h2>
                <p>${err.message}</p>
            </body>
            </html>
        `);
    }
};