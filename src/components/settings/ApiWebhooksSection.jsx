import { useEffect, useState, useCallback } from "react";
import { KeyRound, Copy, Check, Trash2, ListTree, CheckCircle2, XCircle } from "lucide-react";
import { settings } from "../../api/GrowClient";
import {
  SectionCard,
  Field,
  TextInput,
  Button,
  Badge,
  SectionSkeleton,
  LoadError,
  EmptyState,
} from "./ui/SettingsPrimitives";

export default function ApiWebhooksSection() {
  const [keys, setKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null); // full secret shown once, right after creation
  const [copiedId, setCopiedId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [keysRes, logsRes] = await Promise.all([
        settings.getApiKeys(),
        settings.getWebhookLogs({ limit: 20 }),
      ]);
      setKeys(keysRes.data ?? []);
      setLogs(logsRes.data ?? []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateKey(e) {
    e.preventDefault();
    if (!newKeyLabel.trim()) return;
    setCreating(true);
    try {
      const { data } = await settings.createApiKey(newKeyLabel.trim());
      // The backend only ever returns the full secret on creation; after
      // this it's stored hashed and only the prefix is ever shown again.
      setRevealedKey(data);
      setKeys((prev) => [{ ...data, secret: undefined }, ...prev]);
      setNewKeyLabel("");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(id, value) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleRevoke(keyId) {
    setRevokingId(keyId);
    try {
      await settings.revokeApiKey(keyId);
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (loadError) return <LoadError message={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <SectionCard title="API keys" description="Used to authenticate requests to the Grow API from your own systems." icon={KeyRound}>
        {revealedKey && (
          <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/5 p-4">
            <p className="text-xs font-medium text-teal-400">
              Copy this key now — you won't be able to see it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-slate-950 px-3 py-2 text-xs text-slate-200">
                {revealedKey.secret}
              </code>
              <Button type="button" variant="secondary" size="sm" onClick={() => handleCopy("reveal", revealedKey.secret)}>
                {copiedId === "reveal" ? <Check size={13} /> : <Copy size={13} />}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRevealedKey(null)}>
                Done
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreateKey} className="mb-4 flex items-end gap-3">
          <Field label="Key label" htmlFor="keyLabel" className="flex-1" hint='e.g. "Production backend"'>
            <TextInput
              id="keyLabel"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Production backend"
            />
          </Field>
          <Button type="submit" loading={creating}>
            Generate key
          </Button>
        </form>

        {keys.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API keys yet" description="Generate one to start calling the Grow API." />
        ) : (
          <ul className="divide-y divide-slate-800">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm text-slate-200">{key.label}</p>
                  <p className="font-mono text-xs text-slate-500">
                    {key.prefix}••••••••••••{key.lastFour}
                  </p>
                  <p className="text-xs text-slate-600">
                    Created {key.createdAt}
                    {key.lastUsedAt ? ` · last used ${key.lastUsedAt}` : " · never used"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" loading={revokingId === key.id} onClick={() => handleRevoke(key.id)}>
                  <Trash2 size={14} className="text-red-400" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Webhook delivery log" description="Recent outbound webhook attempts from this workspace." icon={ListTree}>
        {logs.length === 0 ? (
          <EmptyState icon={ListTree} title="No webhook activity yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 pr-4 font-medium">Endpoint</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 text-slate-300">{log.event}</td>
                    <td className="max-w-[220px] truncate py-2 pr-4 text-slate-500">{log.endpoint}</td>
                    <td className="py-2 pr-4">
                      {log.success ? (
                        <Badge tone="success">
                          <CheckCircle2 size={11} /> {log.statusCode}
                        </Badge>
                      ) : (
                        <Badge tone="danger">
                          <XCircle size={11} /> {log.statusCode ?? "Failed"}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 text-slate-500">{log.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
