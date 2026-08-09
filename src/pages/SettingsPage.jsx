import React, { useState } from 'react';
import {
  User,
  Store,
  Bot,
  Users,
  Plug,
  Key,
  Bell,
  CreditCard,
  Save,
  RotateCcw,
  ShieldAlert,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  Globe
} from 'lucide-react';

// Import existing modular components
import ProfileSection from '../components/settings/ProfileSection';
import StoreSection from '../components/settings/StoreSection';
import NotificationSection from '../components/settings/NotificationSection';
import SecuritySection from '../components/settings/SecuritySection';
import DeveloperSection from '../components/settings/DeveloperSection';
import DangerZoneSection from '../components/settings/DangerZoneSection';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('ai_agent');
  const [loading, setLoading] = useState(false);

  // Tab Configurations
  const tabs = [
    { id: 'general', label: 'General & Profile', icon: User },
    { id: 'store', label: 'Store & Workspaces', icon: Store },
    { id: 'ai_agent', label: 'AI Agent & Guardrails', icon: Bot },
    { id: 'team', label: 'Team & Escalations', icon: Users },
    { id: 'integrations', label: 'Integrations & Channels', icon: Plug },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'api_webhooks', label: 'API & Webhooks', icon: Key },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
  ];

  const handleSaveAll = async () => {
    setLoading(true);
    // API logic to sync with Supabase
    setTimeout(() => setLoading(false), 800);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto text-slate-200 space-y-6">
      {/* Top Navigation Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings & Preferences</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your AI bot rules, omnichannel channels, store preferences, and developer tools.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-xs font-medium text-slate-300 border border-white/10 rounded-lg hover:bg-white/5 transition-colors flex items-center">
            <RotateCcw className="w-4 h-4 mr-2" /> Discard
          </button>
          <button
            onClick={handleSaveAll}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold bg-teal-500 hover:bg-teal-600 text-black rounded-lg transition-all flex items-center disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" /> {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tab Horizontal Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render Active Tab View */}
      <div className="pt-2">
        {activeTab === 'general' && (
          <div className="max-w-4xl space-y-6">
            <ProfileSection />
            <SecuritySection />
          </div>
        )}

        {activeTab === 'store' && (
          <div className="max-w-4xl space-y-6">
            <StoreSection />
          </div>
        )}

        {activeTab === 'ai_agent' && <AIAgentSettingsTab />}

        {activeTab === 'team' && <TeamEscalationsTab />}

        {activeTab === 'integrations' && <IntegrationsTab />}

        {activeTab === 'notifications' && (
          <div className="max-w-4xl space-y-6">
            <NotificationSection />
          </div>
        )}

        {activeTab === 'api_webhooks' && (
          <div className="max-w-4xl space-y-6">
            <DeveloperSection />
            <DangerZoneSection />
          </div>
        )}

        {activeTab === 'billing' && <BillingUsageTab />}
      </div>
    </div>
  );
}

/* ==========================================================================
   ENTERPRISE SUB-TABS MODULES
   ========================================================================== */

function AIAgentSettingsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Bot className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-white">AI Engine & Behavior</h3>
        </div>
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Select Primary Model</label>
            <select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200">
              <option value="groq-llama3">Groq Llama 3.1 8B (Ultra Fast)</option>
              <option value="groq-70b">Groq Llama 3.1 70B (High Reasoning)</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Bot Persona Prompt</label>
            <textarea
              rows={4}
              defaultValue="You are GROW AI, an expert sales agent for our e-commerce brand. Be helpful and polite."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-white">Safety Guardrails & Handover Threshold</h3>
        </div>
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Restricted Competitor Keywords</label>
            <input
              type="text"
              defaultValue="Daraz, Ali Express, Amazon"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
            />
          </div>
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-200">AI Confidence Handover Threshold</p>
              <p className="text-slate-500 text-[11px]">Pass to human if confidence is below 75%</p>
            </div>
            <span className="px-2 py-1 bg-teal-500/10 text-teal-400 rounded border border-teal-500/20 font-mono">0.75</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamEscalationsTab() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-white">Human Agents & Assignment</h3>
        </div>
        <button className="px-3 py-1.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/30 rounded-lg flex items-center">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Member
        </button>
      </div>
      <div className="text-xs space-y-2">
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <p className="font-medium text-white">Zayn (You)</p>
            <p className="text-slate-500">zayn@company.com • Admin</p>
          </div>
          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px]">Active</span>
        </div>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[
        { name: 'Shopify', status: 'Connected', desc: 'Auto sync inventory & orders' },
        { name: 'Facebook Messenger', status: 'Connected', desc: 'Omnichannel bot support' },
        { name: 'WhatsApp Business', status: 'Disconnected', desc: 'Meta API transactional alerts' }
      ].map((item, idx) => (
        <div key={idx} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">{item.name}</h4>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${
              item.status === 'Connected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {item.status}
            </span>
          </div>
          <p className="text-xs text-slate-400">{item.desc}</p>
        </div>
      ))}
    </div>
  );
}

function BillingUsageTab() {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 max-w-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-white">SaaS Plan & Tokens</h3>
        </div>
        <span className="px-2.5 py-1 bg-teal-500/10 text-teal-400 border border-teal-500/30 rounded text-xs font-semibold">Pro Enterprise</span>
      </div>
      <p className="text-xs text-slate-400">Monthly AI Tokens Used: 42,150 / 500,000</p>
    </div>
  );
}
