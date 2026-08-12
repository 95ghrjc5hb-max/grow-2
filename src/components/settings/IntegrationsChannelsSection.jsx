import { useEffect, useState, useCallback } from "react";
import { ShoppingBag, MessageCircle, Phone, Plug, Unplug } from "lucide-react";
import { settings } from "../../api/GrowClient";
import { SectionCard, Badge, Button, SectionSkeleton, LoadError } from "./ui/SettingsPrimitives";

const PROVIDER_META = {
  shopify: { label: "Shopify", icon: ShoppingBag, blurb: "Sync products, orders, and customers." },
  messenger: { label: "Meta Messenger", icon: MessageCircle, blurb: "Reply to Facebook Page messages." },
  whatsapp: { label: "WhatsApp Business", icon: Phone, blurb: "Reply to WhatsApp conversations." },
};

const STATUS_TONE = { connected: "success", pending: "warning", error: "danger", disconnected: "neutral" };
const STATUS_LABEL = { connected: "Connected", pending: "Connecting…", error: "Needs attention", disconnected: "Not connected" };

export default function IntegrationsChannelsSection() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyProvider, setBusyProvider] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await settings.getIntegrations();
      setIntegrations(data ?? []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConnect(provider) {
    setBusyProvider(provider);
    try {
      // The backend returns an OAuth `authUrl` for Shopify/Messenger/WhatsApp;
      // we redirect the browser there and settingsService completes the
      // connection on the OAuth callback.
      const { data } = await settings.connectIntegration(provider);
      if (data?.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      await load();
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleDisconnect(provider) {
    setBusyProvider(provider);
    try {
      await settings.disconnectIntegration(provider);
      await load();
    } finally {
      setBusyProvider(null);
    }
  }

  if (loading) return <SectionSkeleton blocks={1} />;
  if (loadError) return <LoadError message={loadError} onRetry={load} />;

  return (
    <SectionCard title="Channels" description="Connect the stores and messaging channels your AI agent works across." icon={Plug}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(PROVIDER_META).map(([provider, meta]) => {
          const integration = integrations.find((i) => i.provider === provider);
          const status = integration?.status ?? "disconnected";
          const Icon = meta.icon;
          const isBusy = busyProvider === provider;

          return (
            <div key={provider} className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
                  <Icon size={19} />
                </span>
                <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">{meta.label}</p>
                <p className="mt-1 text-xs text-slate-500">{meta.blurb}</p>
                {integration?.connectedAccount && (
                  <p className="mt-2 text-xs text-slate-400">as {integration.connectedAccount}</p>
                )}
              </div>
              {status === "connected" ? (
                <Button variant="secondary" size="sm" loading={isBusy} onClick={() => handleDisconnect(provider)}>
                  <Unplug size={14} /> Disconnect
                </Button>
              ) : (
                <Button size="sm" loading={isBusy} onClick={() => handleConnect(provider)}>
                  <Plug size={14} /> Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
