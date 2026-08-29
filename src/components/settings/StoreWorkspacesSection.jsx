import { useEffect, useState, useCallback } from "react";
import { Store, Globe, ShoppingBag, ExternalLink } from "lucide-react";
import { settings } from "../../api/GrowClient";
import {
  SectionCard,
  Field,
  TextInput,
  Select,
  Button,
  SaveStatus,
  Badge,
  SectionSkeleton,
  LoadError,
  EmptyState,
} from "./ui/SettingsPrimitives";

const TIMEZONES = Intl.supportedValuesOf('timeZone');

const CURRENCIES = Intl.supportedValuesOf('currency');

export default function StoreWorkspacesSection() {
  const [workspace, setWorkspace] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [workspaceRes, storeRes] = await Promise.all([
        settings.getWorkspace(),
        settings.getStoreConnection(),
      ]);
      setWorkspace(workspaceRes.data);
      setStore(storeRes.data); // null if no store connected yet
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaveStatus("saving");
    try {
      const { data } = await settings.updateWorkspace({
        name: workspace.name,
        timezone: workspace.timezone,
        currency: workspace.currency,
        supportEmail: workspace.supportEmail,
      });
      setWorkspace(data);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setTimeout(() => setSaveStatus("idle"), 2500);
    }
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (loadError) return <LoadError message={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <SectionCard title="Workspace" description="General settings for this workspace." icon={Store}>
        <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
          <Field label="Workspace name" htmlFor="wsName">
            <TextInput
              id="wsName"
              value={workspace.name || ""}
              onChange={(e) => setWorkspace({ ...workspace, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Support email" htmlFor="supportEmail">
            <TextInput
              id="supportEmail"
              type="email"
              value={workspace.supportEmail || ""}
              onChange={(e) => setWorkspace({ ...workspace, supportEmail: e.target.value })}
            />
          </Field>
          <Field label="Timezone" htmlFor="timezone">
            <Select
              id="timezone"
              value={workspace.timezone || "UTC"}
              onChange={(e) => setWorkspace({ ...workspace, timezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Select
              id="currency"
              value={workspace.currency || "USD"}
              onChange={(e) => setWorkspace({ ...workspace, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" loading={saveStatus === "saving"}>
              Save changes
            </Button>
            <SaveStatus status={saveStatus} />
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Connected store" description="The e-commerce store this workspace pulls orders and products from." icon={ShoppingBag}>
        {store ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800">
                <Globe size={18} className="text-slate-400" />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-100">{store.domain}</p>
                <p className="text-xs text-slate-500">
                  {store.provider} · {store.planName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={store.status === "connected" ? "success" : "warning"}>
                {store.status === "connected" ? "Connected" : "Needs attention"}
              </Badge>
              <a
                href={`https://${store.domain}/admin`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
              >
                Open store <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No store connected"
            description="Connect Shopify from the Integrations tab to sync orders and products."
          />
        )}
      </SectionCard>
    </div>
  );
}
