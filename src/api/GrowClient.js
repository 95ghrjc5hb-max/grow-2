import axios from "axios";

/**
 * GrowClient
 * -----------
 * Thin wrapper around axios for talking to the saas-backend API.
 *
 * NOTE: I don't have your existing GrowClient.js in context, so this file
 * assumes the common shape (axios instance + bearer token from storage).
 * If your real file already has a different auth mechanism (e.g. Supabase
 * session, cookie-based auth), keep your existing `api` instance and just
 * paste the `settings` object at the bottom into it.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach the auth token (and active workspace, if the user belongs to more
// than one) to every outgoing request.
// Attach the auth token...
api.interceptors.request.use((config) => {
  let token = null;

  // 1. Check for manually stored tokens
  token = localStorage.getItem("token") || localStorage.getItem("grow_access_token");

  // 2. Automatically check for Supabase auth tokens if not found manually
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('-auth-token')) {
        try {
          const sbData = JSON.parse(localStorage.getItem(key));
          token = sbData?.access_token || sbData?.currentSession?.access_token;
          break; // Stop loop once token is found
        } catch (e) {
          console.error("Error parsing Supabase token:", e);
        }
      }
    }
  }

  // 3. Attach token to request headers if valid
  if (token && token !== "undefined" && token !== "null") {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const workspaceId = localStorage.getItem("grow_active_workspace_id");
  if (workspaceId) {
    config.headers["X-Workspace-Id"] = workspaceId;
  }

  return config;
});



// Normalize errors so components can rely on `err.message` +
// `err.status` instead of digging into the axios error shape.
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.message || "Something went wrong";

    if (status === 401) {
      // Session expired / invalid token â€” force re-auth.
      localStorage.removeItem("token");
      window.dispatchEvent(new CustomEvent("grow:unauthorized"));
    }

    return Promise.reject({ status, message });
  }
);

/**
 * All `/api/v1/settings/*` endpoints, grouped by section.
 * Every component in components/settings/ talks to the backend only
 * through this object â€” never calls axios directly.
 */
export const settings = {
  // ---- General profile ----
  getProfile: () => api.get("/settings/profile"),
  updateProfile: (payload) => api.patch("/settings/profile", payload),
  changePassword: (payload) => api.post("/settings/profile/password", payload),
  toggle2FA: (enabled) => api.post("/settings/profile/2fa", { enabled }),
  getSessions: () => api.get("/settings/profile/sessions"),
  revokeSession: (sessionId) => api.delete(`/settings/profile/sessions/${sessionId}`),

  // ---- Store / workspace ----
  getWorkspace: () => api.get("/settings/workspace"),
  updateWorkspace: (payload) => api.patch("/settings/workspace", payload),
  getStoreConnection: () => api.get("/settings/workspace/store"),

  // ---- AI agent guardrails ----
  getAIAgentConfig: () => api.get("/settings/ai-agent"),
  updateAIAgentConfig: (payload) => api.patch("/settings/ai-agent", payload),
  getAvailableModels: () => api.get("/settings/ai-agent/models"),

  // ---- Team & escalations ----
  getTeamMembers: () => api.get("/settings/team"),
  inviteTeamMember: (payload) => api.post("/settings/team/invite", payload),
  updateTeamMember: (memberId, payload) => api.patch(`/settings/team/${memberId}`, payload),
  removeTeamMember: (memberId) => api.delete(`/settings/team/${memberId}`),
  getEscalationRules: () => api.get("/settings/team/escalation-rules"),
  updateEscalationRules: (payload) => api.patch("/settings/team/escalation-rules", payload),

  // ---- Integrations / channels ----
  getIntegrations: () => api.get("/settings/integrations"),
  connectIntegration: (provider, payload) => api.post(`/settings/integrations/${provider}/connect`, payload),
  disconnectIntegration: (provider) => api.post(`/settings/integrations/${provider}/disconnect`),

  // ---- Notifications ----
  getNotificationSettings: () => api.get("/settings/notifications"),
  updateNotificationSettings: (payload) => api.patch("/settings/notifications", payload),
  testWebhook: (channel) => api.post("/settings/notifications/test", { channel }),

  // ---- API keys & webhooks ----
  getApiKeys: () => api.get("/settings/api-keys"),
  createApiKey: (label) => api.post("/settings/api-keys", { label }),
  revokeApiKey: (keyId) => api.delete(`/settings/api-keys/${keyId}`),
  getWebhookLogs: (params) => api.get("/settings/api-keys/webhook-logs", { params }),

  // ---- Billing & usage ----
  getBillingUsage: () => api.get("/settings/billing"),
  getInvoices: () => api.get("/settings/billing/invoices"),
};

// Backward compatibility for existing app components
export const Grow = {
  auth: {
    login: async (email, password) => {
      const res = await api.post('/auth/login', { email, password });
   if (res?.token) {
   localStorage.setItem('token', res.token); 
   }
      return res;
    },
    signup: async (email, password) => {
      return await api.post('/auth/signup', { email, password });
    }
  },
  entities: {
    Conversation: {
      list: () => api.get('/conversations'),
      update: (id, payload) => api.patch(`/conversations/${id}`, payload)
    },
    Orders: {
      list: () => api.get('/orders')
    },
    Channel: {
      list: () => api.get('/channels')
    }
  },
  BotConfig: {
    list: () => api.get('/bot-config'),
    create: (payload) => api.post('/bot-config', payload),
    update: (id, payload) => api.patch(`/bot-config/${id}`, payload)
  }
};


export default api;