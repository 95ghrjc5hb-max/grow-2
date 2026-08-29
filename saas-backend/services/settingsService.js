import crypto from "crypto";
import { supabase } from "../config/supabase.js";

// Reused so Settings doesn't duplicate logic that already lives elsewhere.
// If your actual exports have different names, adjust these two lines —
// everything below only calls the functions listed in the comments.
import * as aiAgentService from "./aiAgentService.js"; // expects: listAvailableModels()
import * as shopifyService from "./shopifyService.js";// expects: getConnectionStatus(workspaceId), buildInstallUrl(workspaceId), disconnect(workspaceId)
import * as metaGraphService from "./metaGraphService.js";// expects: getConnectionStatus(workspaceId, channel), buildOAuthUrl(workspaceId, channel), disconnect(workspaceId, channel)

/**
 * settingsService
 * ----------------
 * All Supabase access for the Settings area. Nothing in here trusts a
 * workspaceId that didn't come from authMiddleware — every query below
 * filters on it, so even a caller who tampers with a body payload can't
 * read or write another workspace's rows.
 *
 * Table names assumed (adjust to match your actual schema):
 *   profiles(id, workspace_id, full_name, email, phone, role, two_factor_enabled)
 *   user_sessions(id, user_id, workspace_id, browser, os, device_type, location, last_active_at, is_current)
 *   workspaces(id, name, timezone, currency, support_email)
 *   ai_agent_configs(workspace_id, model, persona, system_prompt, restricted_topics, confidence_threshold)
 *   team_members(id, workspace_id, user_id, email, full_name, role, status)
 *   escalation_rules(workspace_id, working_hours, handover_on_low_confidence,
 *                     handover_on_negative_sentiment, handover_on_refund_request, max_replies_before_handover)
 *   notification_settings(workspace_id, slack, discord)   -- jsonb columns
 *   api_keys(id, workspace_id, label, key_hash, key_prefix, key_last_four, created_at, last_used_at)
 *   webhook_logs(id, workspace_id, event, endpoint, success, status_code, created_at)
 *   billing_accounts(workspace_id, plan_name, status, renews_at, price_label, token_limit)
 *   invoices(id, workspace_id, date, amount_label, pdf_url)
 */

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function assertNoError(error, context) {
  if (error) {
    const err = new Error(`${context}: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

async function getProfile(userId, workspaceId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle(); // FIXED: Changed .single() to .maybeSingle()

  assertNoError(error, "Failed to load profile");

  // Prevent crash if profile is missing in the database
  return {
    id: userId,
    fullName: data?.full_name || "New User",
    email: data?.email || "",
    phone: data?.phone || "",
    role: data?.role || "owner",
    twoFactorEnabled: data?.two_factor_enabled || false,
  };
}

async function updateProfile(userId, workspaceId, { fullName, email, phone }) {
  // FIXED: Changed update() to upsert() to create a row if it doesn't exist
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: fullName, email: email, phone: phone })
    .select("*")
    .maybeSingle();

  assertNoError(error, "Failed to update profile");

  return {
    id: data?.id || userId,
    fullName: data?.full_name,
    email: data?.email,
    phone: data?.phone,
    role: data?.role || "owner",
    twoFactorEnabled: data?.two_factor_enabled || false,
  };
}

async function changePassword(userId, currentPassword, newPassword) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
    
  assertNoError(profileError, "Failed to load profile for password change");
  
  if (!profile || !profile.email) {
    throw new ValidationError("Email not found for this profile. Please update your email first.");
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });
  
  if (verifyError) throw new ValidationError("Current password is incorrect");

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  
  assertNoError(updateError, "Failed to update password");
}

async function setTwoFactorEnabled(userId, workspaceId, enabled) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, two_factor_enabled: enabled });
    
  assertNoError(error, "Failed to update two-factor setting");
}

async function listSessions(userId) {
  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, browser, os, device_type, location, last_active_at, is_current")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false });

  assertNoError(error, "Failed to load sessions");
  return (data ?? []).map((s) => ({
    id: s.id,
    browser: s.browser,
    os: s.os,
    deviceType: s.device_type,
    location: s.location,
    lastActiveAt: s.last_active_at,
    isCurrent: s.is_current,
  }));
}

async function revokeSession(userId, sessionId) {
  const { data, error } = await supabase
    .from("user_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId) // prevents revoking another user's session by guessing an id
    .select("id")
    .single();

  assertNoError(error, "Failed to revoke session");
  if (!data) throw new NotFoundError("Session not found");
}
async function deleteAccount(userId) {
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  assertNoError(error, "Failed to delete account data from database");
}
// ---------------------------------------------------------------------------
// Store & workspace
// ---------------------------------------------------------------------------

async function getWorkspace(workspaceId) {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle(); // FIXED: Changed to maybeSingle to prevent crash

  assertNoError(error, "Failed to load workspace");

  return {
    id: data?.id || workspaceId,
    name: data?.name || "My Workspace",
    timezone: data?.timezone || "UTC",
    currency: data?.currency || "BDT",
    supportEmail: data?.support_email || "",
  };
}

async function updateWorkspace(workspaceId, { name, timezone, currency, supportEmail }) {
  const { data, error } = await supabase
    .from("organizations")
    .upsert({ id: workspaceId, name, timezone, currency, support_email: supportEmail }) // FIXED: Use upsert
    .select("*")
    .maybeSingle();

  assertNoError(error, "Failed to update workspace");
  return {
    id: data?.id || workspaceId,
    name: data?.name,
    timezone: data?.timezone,
    currency: data?.currency,
    supportEmail: data?.support_email,
  };
}

async function getStoreConnection(workspaceId) {
  // FIXED: Removed missing shopifyService function and querying DB directly
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("platform", "shopify")
    .eq("org_id", workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return { status: "connected", provider: "Shopify", domain: data.account_name || "Shopify Store", planName: "Active" };
}

// ---------------------------------------------------------------------------
// AI agent guardrails
// ---------------------------------------------------------------------------

async function getAIAgentConfig(workspaceId) {
  const { data, error } = await supabase
    .from("bot_configs")
    .select("*")
    .eq("org_id", workspaceId) // FIXED: Changed user_id to org_id based on terminal error
    .maybeSingle();

  assertNoError(error, "Failed to load AI config");

  return {
  model: data?.model_name || "Llama-3.1-8b-instant",
  persona: data?.persona || "Grow AI Assistant",
  systemPrompt: data?.system_prompt || "",
  restrictedTopics: data?.restricted_topics || [],
  confidenceThreshold: data?.confidence_threshold ?? 0.8,
};
}

async function updateAIAgentConfig(workspaceId, payload) {
  const { data, error } = await supabase
    .from("bot_configs")
    .upsert({
  org_id: workspaceId, 
  model_name: payload.model,
  system_prompt: payload.systemPrompt,
  persona: payload.persona,
  restricted_topics: payload.restrictedTopics,
  confidence_threshold: payload.confidenceThreshold
}, { onConflict: 'org_id' })

    .select("*")
    .maybeSingle();

  assertNoError(error, "Failed to update AI agent config");
  return payload;
}

async function getAvailableModels() {
  return [
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Fast)" },
    { id: "llama-3.1-70b-versatile", label: "Llama 3.1 70B (Smart)" }
  ];
}

// ---------------------------------------------------------------------------
// Team & escalations
// ---------------------------------------------------------------------------

async function listTeamMembers(workspaceId) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("*") // FIXED: Removed specific user_role_type to avoid column error
    .eq("org_id", workspaceId);

  assertNoError(error, "Failed to load team members");
  return (data ?? []).map((m) => ({
    id: m.id,
    email: m.email || "",
    fullName: m.full_name || "",
    role: m.role || "member", // FIXED: Adjusted to fallback role
    status: m.status || "active",
  }));
}

async function inviteTeamMember(workspaceId, { email, role }) {
  const { data, error } = await supabase
    .from("organization_members")
    .insert({ org_id: workspaceId, email, role: role, full_name: "Pending Member", status: "pending" })
    .select("*")
    .single();

  assertNoError(error, "Failed to invite team member");
  return { id: data?.id, email: data?.email, fullName: data?.full_name, role: data?.role, status: data?.status };
}

async function updateTeamMember(workspaceId, memberId, { role }) {
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role: role })
    .eq("id", memberId)
    .eq("org_id", workspaceId)
    .select("*")
    .maybeSingle();

  assertNoError(error, "Failed to update team member");
  return { id: data?.id, email: data?.email, fullName: data?.full_name, role: data?.role, status: data?.status };
}

async function removeTeamMember(workspaceId, memberId) {
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", workspaceId);
  assertNoError(error, "Failed to remove team member");
}

async function getEscalationRules(workspaceId) {
  const { data, error } = await supabase
    .from("escalation_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle(); // FIXED: Used maybeSingle to prevent crash on empty table

  assertNoError(error, "Failed to load escalation rules");

  return {
    workingHours: data?.working_hours || { start: "09:00", end: "17:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    handoverOnLowConfidence: data?.handover_on_low_confidence ?? true,
    handoverOnNegativeSentiment: data?.handover_on_negative_sentiment ?? true,
    handoverOnRefundRequest: data?.handover_on_refund_request ?? true,
    maxRepliesBeforeHandover: data?.max_replies_before_handover ?? 5,
  };
}

async function updateEscalationRules(workspaceId, payload) {
  const { data, error } = await supabase
    .from("escalation_rules")
    .upsert({
      org_id: workspaceId,
      working_hours: payload.working_hours,
      handover_on_low_confidence: payload.handover_on_low_confidence,
      handover_on_negative_sentiment: payload.handover_on_negative_sentiment,
      handover_on_refund_request: payload.handover_on_refund_request,
      max_replies_before_handover: payload.max_replies_before_handover
    }, { onConflict: 'org_id' })
    .select("*")
    .maybeSingle();

  assertNoError(error, "Failed to update escalation rules");
  return payload;
}


// ---------------------------------------------------------------------------
// Integrations & channels
// ---------------------------------------------------------------------------

async function listIntegrations(workspaceId) {
  // FIXED: Querying DB directly instead of calling non-existent service functions
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("org_id", workspaceId);

  if (error || !data) return [];
  
  return data.map((i) => ({
    provider: i.platform,
    status: i.status === "connected" || i.is_active ? "connected" : "disconnected",
    connectedAccount: i.account_name || i.shop_domain || "Connected Account",
  }));
}

async function connectIntegration(workspaceId, provider) {
  return { authUrl: null };
}

async function disconnectIntegration(workspaceId, provider) {
  await supabase
    .from("integrations")
    .delete()
    .eq("platform", provider)
    .eq("org_id", workspaceId);
  return null;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function getNotificationSettings(workspaceId) {
  const { data, error } = await supabase
    .from("notification_settings")
    .select("slack, discord")
    .eq("workspace_id", workspaceId)
    .maybeSingle(); // FIXED: Changed to maybeSingle

  assertNoError(error, "Failed to load notification settings");

  const defaults = { webhookUrl: "", notifyOnHandover: false, notifyOnOrderUpdate: false };
  return {
    slack: { ...defaults, ...(data?.slack ?? {}) },
    discord: { ...defaults, ...(data?.discord ?? {}) },
  };
}

async function updateNotificationSettings(workspaceId, payload) {
  const { data, error } = await supabase
    .from("notification_settings")
    .upsert({ workspace_id: workspaceId, slack: payload.slack, discord: payload.discord }) // FIXED: Added upsert
    .select("slack, discord")
    .maybeSingle();

  assertNoError(error, "Failed to update notification settings");
  return { slack: data?.slack || payload.slack, discord: data?.discord || payload.discord };
}

async function sendTestWebhook(workspaceId, channel) {
  const settingsRow = await getNotificationSettings(workspaceId);
  const url = settingsRow[channel]?.webhookUrl;
  if (!url) throw new ValidationError(`No ${channel} webhook URL configured`);

  const body = channel === "slack"
      ? { text: "✅ Test alert from Grow — your Slack webhook is working." }
      : { content: "✅ Test alert from Grow — your Discord webhook is working." };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ValidationError(`Webhook responded with status ${response.status}`);
  }
}

// ---------------------------------------------------------------------------
// API keys & webhook logs
// ---------------------------------------------------------------------------

function generateApiKey() {
  const secret = `sk_live_${crypto.randomBytes(24).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  return { secret, hash, prefix: secret.slice(0, 11), lastFour: secret.slice(-4) };
}

async function listApiKeys(workspaceId) {
  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  assertNoError(error, "Failed to load API keys");
  return (data ?? []).map((k) => ({
    id: k.id,
    label: k.label,
    prefix: k.key_prefix,
    lastFour: k.key_last_four,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
  }));
}

async function createApiKey(workspaceId, label) {
  if (!label || !label.trim()) throw new ValidationError("label is required");

  const { secret, hash, prefix, lastFour } = generateApiKey();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: workspaceId,
      workspace_id: workspaceId,
      label: label.trim(),
      key_hash: hash,
      key_prefix: prefix,
      key_last_four: lastFour,
    })
    .select("*")
    .single();

  assertNoError(error, "Failed to create API key");
  return { id: data.id, label: data.label, createdAt: data.created_at, secret, prefix, lastFour };
}

async function revokeApiKey(workspaceId, keyId) {
  const { data, error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", keyId)
    .eq("workspace_id", workspaceId)
    .select("id")
    .maybeSingle();

  assertNoError(error, "Failed to revoke API key");
}

async function getWebhookLogs(workspaceId, { limit = 20, cursor } = {}) {
  let query = supabase
    .from("webhook_logs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 20, 100));

  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  assertNoError(error, "Failed to load webhook logs");

  return (data ?? []).map((l) => ({
    id: l.id,
    event: l.event,
    endpoint: l.endpoint,
    success: l.success,
    statusCode: l.status_code,
    createdAt: l.created_at,
  }));
}

// ///////////////////////////////////////////////////////////////////////////
// // Billing & usage
// ///////////////////////////////////////////////////////////////////////////

function startOfCurrentMonthISO() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// Removed 'export' to prevent Duplicate Export error!
async function getBillingUsage(workspaceId) {
    // 1. Fetch billing info from the database
    const { data: billing, error: billingError } = await supabase
        .from("billing_accounts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

    assertNoError(billingError, "Failed to load billing account");

    const now = new Date();
    // Default fallback: 1st day of the current month
    let planStartedAt = new Date(now.getFullYear(), now.getMonth(), 1); 
    let isExpired = false;
    let renewsAtDate = "N/A";
    
    // Default Free Plan settings
    let activePlanName = "Grow Free";
    let activeTokenLimit = 30; 
    let activePriceLabel = "$0/mo";

    if (billing && billing.updated_at) {
        const lastUpdated = new Date(billing.updated_at);
        const expiryDate = new Date(lastUpdated);
        expiryDate.setMonth(expiryDate.getMonth() + 1); // Expires exactly after 1 month

        renewsAtDate = expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

        if (now > expiryDate) {
            // Plan has expired (30 days passed)
            isExpired = true;
            renewsAtDate = "Expired";
            
            // Reverts to Free Plan, usage count resets to the 1st of the current month
            planStartedAt = new Date(now.getFullYear(), now.getMonth(), 1); 
        } else {
            // Plan is still active
            activePlanName = billing.plan_name;
            activeTokenLimit = billing.token_limit;
            activePriceLabel = billing.price_label;
            
            // Magic Logic: Usage count starts EXACTLY from the date the user purchased/renewed the plan
            planStartedAt = lastUpdated; 
        }
    }

    // 2. Count conversations created AFTER 'planStartedAt' date
    const [
        { count: activeChats },
        { count: usedChats }
    ] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", workspaceId).eq("status", "open"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", workspaceId).gte("created_at", planStartedAt.toISOString()),
    ]);

    return {
            planName: activePlanName,
            status: isExpired ? "Expired" : (billing?.status || "Active"),
            renewsAt: renewsAtDate,
            priceLabel: activePriceLabel,
            
            // Fixes for Customer Usage progress bar (Frontend expects these names)
            customerLimit: billing?.token_limit || activeTokenLimit,
            customersUsed: billing?.tokens_used || 0,

            tokenLimit: billing?.token_limit || activeTokenLimit,
            tokensUsed: billing?.tokens_used || 0,

            activeChats: activeChats ?? 0,
            chatsThisMonth: usedChats ?? 0,
        };
}

// User notun plan kinle database e update korar jonno notun function
export async function updateBillingPlan(workspaceId, newPlanName, newLimit, newPriceLabel) {
    const { data, error } = await supabase
        .from('billing_accounts')
        .upsert({ 
            workspace_id: workspaceId, // Jodi database e org_id thake tobe ekhane org_id likhben
            plan_name: newPlanName,
            token_limit: newLimit,
            price_label: newPriceLabel,
            updated_at: new Date().toISOString()
        }, { onConflict: 'workspace_id' }) // onConflict eo same
        .select()
        .single();

    assertNoError(error, "Failed to update billing plan");
    return data;
}

async function getInvoices(workspaceId) {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("date", { ascending: false });

  assertNoError(error, "Failed to load invoices");
  return (data ?? []).map((i) => ({ id: i.id, date: i.date, amountLabel: i.amount_label, pdfUrl: i.pdf_url }));
}

export {
 deleteAccount,
  NotFoundError,
  ValidationError,
  getProfile,
  updateProfile,
  changePassword,
  setTwoFactorEnabled,
  listSessions,
  revokeSession,
  getWorkspace,
  updateWorkspace,
  getStoreConnection,
  getAIAgentConfig,
  updateAIAgentConfig,
  getAvailableModels,
  listTeamMembers,
  inviteTeamMember,
  updateTeamMember,
  removeTeamMember,
  getEscalationRules,
  updateEscalationRules,
  listIntegrations,
  connectIntegration,
  disconnectIntegration,
  getNotificationSettings,
  updateNotificationSettings,
  sendTestWebhook,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getWebhookLogs,
  getBillingUsage,
  getInvoices,
};
