import * as settingsService from "../services/settingsService.js";

/**
 * settingsController
 * ------------------
 */

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ✅ সঠিকভাবে User ID এবং Workspace ID বের করার জন্য Helper Function
const getUserId = (req) => req.user?.id || req.user?.userId || req.user?.sub;
const getWorkspaceId = (req) => req.headers["x-workspace-id"] || req.user?.org_id || getUserId(req);

// ---- General profile ----

export const getProfile = asyncHandler(async (req, res) => {
  const data = await settingsService.getProfile(getUserId(req), getWorkspaceId(req));
  res.json({ success: true, data });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, email, phone } = req.body;
  const data = await settingsService.updateProfile(getUserId(req), getWorkspaceId(req), { fullName, email, phone });
  res.json({ success: true, data });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: "currentPassword and newPassword are required" });
  }
  await settingsService.changePassword(getUserId(req), currentPassword, newPassword);
  res.json({ success: true, data: null });
});

export const setTwoFactor = asyncHandler(async (req, res) => {
  await settingsService.setTwoFactorEnabled(getUserId(req), getWorkspaceId(req), Boolean(req.body.enabled));
  res.json({ success: true, data: { enabled: Boolean(req.body.enabled) } });
});

export const listSessions = asyncHandler(async (req, res) => {
  const data = await settingsService.listSessions(getUserId(req));
  res.json({ success: true, data });
});

export const revokeSession = asyncHandler(async (req, res) => {
  await settingsService.revokeSession(getUserId(req), req.params.sessionId);
  res.json({ success: true, data: null });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  await settingsService.deleteAccount(getUserId(req));
  res.json({ success: true, message: "Account deleted successfully" });
});
// ---- Store & workspace ----

export const getWorkspace = asyncHandler(async (req, res) => {
  const data = await settingsService.getWorkspace(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const updateWorkspace = asyncHandler(async (req, res) => {
  const { name, timezone, currency, supportEmail } = req.body;
  const data = await settingsService.updateWorkspace(getWorkspaceId(req), { name, timezone, currency, supportEmail });
  res.json({ success: true, data });
});

export const getStoreConnection = asyncHandler(async (req, res) => {
  const data = await settingsService.getStoreConnection(getWorkspaceId(req));
  res.json({ success: true, data });
});

// ---- AI agent guardrails ----

export const getAIAgentConfig = asyncHandler(async (req, res) => {
  const data = await settingsService.getAIAgentConfig(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const updateAIAgentConfig = asyncHandler(async (req, res) => {
  const data = await settingsService.updateAIAgentConfig(getWorkspaceId(req), req.body);
  res.json({ success: true, data });
});

export const getAvailableModels = asyncHandler(async (req, res) => {
  const data = await settingsService.getAvailableModels();
  res.json({ success: true, data });
});

// ---- Team & escalations ----

export const listTeamMembers = asyncHandler(async (req, res) => {
  const data = await settingsService.listTeamMembers(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const inviteTeamMember = asyncHandler(async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ success: false, error: "email is required" });
  const data = await settingsService.inviteTeamMember(getWorkspaceId(req), { email, role });
  res.status(201).json({ success: true, data });
});

export const updateTeamMember = asyncHandler(async (req, res) => {
  const data = await settingsService.updateTeamMember(getWorkspaceId(req), req.params.memberId, {
    role: req.body.role,
  });
  res.json({ success: true, data });
});

export const removeTeamMember = asyncHandler(async (req, res) => {
  await settingsService.removeTeamMember(getWorkspaceId(req), req.params.memberId);
  res.json({ success: true, data: null });
});

export const getEscalationRules = asyncHandler(async (req, res) => {
  const data = await settingsService.getEscalationRules(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const updateEscalationRules = asyncHandler(async (req, res) => {
  const data = await settingsService.updateEscalationRules(getWorkspaceId(req), req.body);
  res.json({ success: true, data });
});

// ---- Integrations & channels ----

export const listIntegrations = asyncHandler(async (req, res) => {
  const data = await settingsService.listIntegrations(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const connectIntegration = asyncHandler(async (req, res) => {
  const data = await settingsService.connectIntegration(getWorkspaceId(req), req.params.provider);
  res.json({ success: true, data });
});

export const disconnectIntegration = asyncHandler(async (req, res) => {
  await settingsService.disconnectIntegration(getWorkspaceId(req), req.params.provider);
  res.json({ success: true, data: null });
});

// ---- Notifications ----

export const getNotificationSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.getNotificationSettings(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const updateNotificationSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.updateNotificationSettings(getWorkspaceId(req), req.body);
  res.json({ success: true, data });
});

export const testWebhook = asyncHandler(async (req, res) => {
  const { channel } = req.body;
  if (!["slack", "discord"].includes(channel)) {
    return res.status(400).json({ success: false, error: "channel must be 'slack' or 'discord'" });
  }
  await settingsService.sendTestWebhook(getWorkspaceId(req), channel);
  res.json({ success: true, data: null });
});

// ---- API keys & webhooks ----

export const listApiKeys = asyncHandler(async (req, res) => {
  const data = await settingsService.listApiKeys(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const createApiKey = asyncHandler(async (req, res) => {
  const data = await settingsService.createApiKey(getWorkspaceId(req), req.body.label);
  res.status(201).json({ success: true, data });
});

export const revokeApiKey = asyncHandler(async (req, res) => {
  await settingsService.revokeApiKey(getWorkspaceId(req), req.params.keyId);
  res.json({ success: true, data: null });
});

export const getWebhookLogs = asyncHandler(async (req, res) => {
  const data = await settingsService.getWebhookLogs(getWorkspaceId(req), req.query);
  res.json({ success: true, data });
});

// ---- Billing & usage ----

export const getBillingUsage = asyncHandler(async (req, res) => {
  const data = await settingsService.getBillingUsage(getWorkspaceId(req));
  res.json({ success: true, data });
});

export const getInvoices = asyncHandler(async (req, res) => {
  const data = await settingsService.getInvoices(getWorkspaceId(req));
  res.json({ success: true, data });
});
export const updatePlan = asyncHandler(async (req, res) => {
    const { planName } = req.body;
    if (!planName) return res.status(400).json({ success: false, error: "Plan name is required" });
    
   
    let limit = 30;
    let priceLabel = "$0/mo";
    const name = planName.toLowerCase();

    if (name.includes("pro") || name.includes("29")) {
        limit = 500;
        priceLabel = "$29/mo";
    } else if (name.includes("premium") || name.includes("59")) {
        limit = 1200;
        priceLabel = "$59/mo";
    } else if (name.includes("unlimited") || name.includes("100") || name.includes("enterprise")) {
        limit = 3000;
        priceLabel = "$100/mo";
    }
    
   
    const data = await settingsService.updateBillingPlan(getWorkspaceId(req), planName, limit, priceLabel);
    res.json({ success: true, data });
});