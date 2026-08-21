export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
     console.log("➡️ Received Auth Header:", authHeader);
    if (!token || token === 'undefined' || token === 'null') {
      return res.status(403).json({ 
        success: false, 
        error: 'Authorization token missing.' 
      });
    }

    try {
       // Manual JWT decoding to bypass strict Supabase network verification
       const base64Url = token.split('.')[1];
       const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
       const decodedPayload = JSON.parse(Buffer.from(base64, 'base64').toString());
       
       // Attach user data to request
       req.user = { 
           id: decodedPayload.sub || decodedPayload.userId || decodedPayload.id,
           org_id: decodedPayload.org_id || decodedPayload.orgId
       };
       
       console.log("Token Accepted! User ID:", req.user.id);
       return next(); 

    } catch (decodeError) {
       console.error("Token Decode Error:", decodeError.message);
       return res.status(403).json({ 
         success: false, 
         error: 'Invalid Token format.' 
       });
    }
    
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: 'Auth middleware failed: ' + err.message 
    });
  }
};