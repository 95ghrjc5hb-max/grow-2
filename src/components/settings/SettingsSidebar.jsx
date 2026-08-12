import {
  UserCircle,
  Store,
  Bot,
  Users,
  Plug,
  Bell,
  KeyRound,
  CreditCard,
} from "lucide-react";

/**
 * Central source of truth for the tab list. Adding a 9th tab later means
 * adding one entry here + one case in SettingsPage's switch — nothing else
 * has to change.
 */
export const SETTINGS_TABS = [
  { id: "profile", label: "General & Profile", icon: UserCircle },
  { id: "workspace", label: "Store & Workspace", icon: Store },
  { id: "ai-agent", label: "AI Agent Guardrails", icon: Bot },
  { id: "team", label: "Team & Escalations", icon: Users },
  { id: "integrations", label: "Integrations & Channels", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "api-webhooks", label: "API & Webhooks", icon: KeyRound },
  { id: "billing", label: "Billing & Usage", icon: CreditCard },
];

export default function SettingsSidebar({ activeTab, onTabChange }) {
  return (
    <nav
      aria-label="Settings sections"
      className="w-full shrink-0 border-slate-800 md:w-64 md:border-r"
    >
      <ul className="flex gap-1 overflow-x-auto px-2 py-3 md:flex-col md:overflow-visible md:px-3">
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <li key={tab.id} className="shrink-0 md:shrink">
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onTabChange(tab.id)}
                className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                  font-medium transition-colors
                  ${
                    isActive
                      ? "bg-teal-500/10 text-teal-400"
                      : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                  }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-teal-400 md:block" />
                )}
                <Icon size={17} strokeWidth={2} className="shrink-0" />
                <span className="whitespace-nowrap md:whitespace-normal">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
