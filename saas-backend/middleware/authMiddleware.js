import supabase from '../config/supabase.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authorization token missing. Access denied.' 
      });
    }

    // Verify token with Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid or expired token.' 
      });
    }

    // Attach user object to request
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication middleware failure: ' + err.message 
    });
  }
};
