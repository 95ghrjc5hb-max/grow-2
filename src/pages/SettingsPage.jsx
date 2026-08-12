import { useState } from 'react';
import SettingsSidebar, { SETTINGS_TABS } from "../components/settings/SettingsSidebar.jsx";
import GeneralProfileSection from "../components/settings/GeneralProfileSection.jsx";
import StoreWorkspacesSection from "../components/settings/StoreWorkspacesSection.jsx";
import AIAgentGuardrailsSection from "../components/settings/AIAgentGuardrailsSection.jsx";
import TeamEscalationsSection from "../components/settings/TeamEscalationsSection.jsx";
import IntegrationsChannelsSection from "../components/settings/IntegrationsChannelsSection.jsx";
import NotificationsSection from "../components/settings/NotificationsSection.jsx";
import ApiWebhooksSection from "../components/settings/ApiWebhooksSection.jsx";
import BillingUsageSection from "../components/settings/BillingUsageSection.jsx";


// Maps a tab id to the component that renders it. Using a lookup object
// instead of a big switch/if-chain keeps this trivially extensible and
// means each section only mounts (and only fires its fetch) when active.
const SECTION_COMPONENTS = {
  profile: GeneralProfileSection,
  workspace: StoreWorkspacesSection,
  "ai-agent": AIAgentGuardrailsSection,
  team: TeamEscalationsSection,
  integrations: IntegrationsChannelsSection,
  notifications: NotificationsSection,
  "api-webhooks": ApiWebhooksSection,
  billing: BillingUsageSection,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS[0].id);

  const ActiveSection = SECTION_COMPONENTS[activeTab] ?? GeneralProfileSection;
  const activeTabMeta = SETTINGS_TABS.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 px-6 py-5">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your profile, workspace, AI agent, and integrations.
        </p>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:px-6">
        <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="min-w-0 flex-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 md:hidden">
            {activeTabMeta?.label}
          </h2>
          {/* key forces a clean remount (and fresh fetch) on every tab switch */}
          <ActiveSection key={activeTab} />
        </main>
      </div>
    </div>
  );
}

