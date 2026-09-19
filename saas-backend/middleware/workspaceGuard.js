import { supabase } from '../config/supabase.js';

export const verifyWorkspaceAccess = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User authentication required.' });
    }

    // Resolve target workspace identifier
    const targetWorkspaceId =
  req.headers?.['x-workspace-id'] ||
  req.params?.workspaceId ||
  req.query?.workspaceId ||
  req.body?.workspaceId ||
  req.user?.org_id;

    if (!targetWorkspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context missing.' });
    }

    // Direct 1:1 ownership match
    if (targetWorkspaceId === userId) {
      req.workspaceId = targetWorkspaceId;
      req.workspaceRole = 'owner';
      return next();
    }

    // Check multi-tenant team membership
    const { data: membership, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', targetWorkspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !membership) {
      console.warn(`[SECURITY] Unauthorized workspace access attempt by user: ${userId}`);
      return res.status(403).json({ 
        success: false, 
        error: 'Forbidden: You do not have permission to access this workspace.' 
      });
    }

    req.workspaceId = targetWorkspaceId;
    req.workspaceRole = membership.role;
    return next();
  } catch (err) {
    console.error('Workspace verification failure:', err);
    return res.status(500).json({ success: false, error: 'Authorization processing error.' });
  }
};