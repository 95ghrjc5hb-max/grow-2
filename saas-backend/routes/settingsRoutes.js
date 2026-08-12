import express from "express";
import * as settingsController from "../controllers/settingsController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Auth Middleware সক্রিয় করা হলো
router.use(authenticateToken);

// -- General Profile --
router.get("/profile", settingsController.getProfile);
router.patch("/profile", settingsController.updateProfile);
router.post("/profile/password", settingsController.changePassword);
router.post("/profile/2fa", settingsController.setTwoFactor);
router.get("/profile/sessions", settingsController.listSessions);
router.delete("/profile/sessions/:sessionId", settingsController.revokeSession);

// -- Store & Workspace --
router.get("/workspace", settingsController.getWorkspace);
router.patch("/workspace", settingsController.updateWorkspace);
router.get("/workspace/store", settingsController.getStoreConnection);

// -- AI Agent Guardrails --
router.get("/ai-agent", settingsController.getAIAgentConfig);
router.patch("/ai-agent", settingsController.updateAIAgentConfig);
router.get("/ai-agent/models", settingsController.getAvailableModels);

// -- Team & Escalations --
router.get("/team", settingsController.listTeamMembers);
router.post("/team/invite", settingsController.inviteTeamMember);
router.patch("/team/:memberId", settingsController.updateTeamMember);
router.delete("/team/:memberId", settingsController.removeTeamMember);
router.get("/team/escalation-rules", settingsController.getEscalationRules);
router.patch("/team/escalation-rules", settingsController.updateEscalationRules);

// -- Integrations & Channels --
router.get("/integrations", settingsController.listIntegrations);
router.post("/integrations/:provider/connect", settingsController.connectIntegration);
router.post("/integrations/:provider/disconnect", settingsController.disconnectIntegration);

// -- Notifications --
router.get("/notifications", settingsController.getNotificationSettings);
router.patch("/notifications", settingsController.updateNotificationSettings);
router.post("/notifications/test", settingsController.testWebhook);

// -- API Keys & Webhooks --
router.get("/api-keys", settingsController.listApiKeys);
router.post("/api-keys", settingsController.createApiKey);
router.delete("/api-keys/:keyId", settingsController.revokeApiKey);
router.get("/api-keys/webhook-logs", settingsController.getWebhookLogs);

// -- Billing & Usage --
router.get("/billing", settingsController.getBillingUsage);
router.get("/billing/invoices", settingsController.getInvoices);

export default router;
