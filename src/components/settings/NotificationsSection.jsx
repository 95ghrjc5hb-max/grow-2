import { useEffect, useState, useCallback } from "react";
import { Slack, Hash, Send } from "lucide-react";
import { settings } from "../../api/GrowClient";
import {
  SectionCard,
  Field,
  TextInput,
  Toggle,
  Button,
  SaveStatus,
  SectionSkeleton,
  LoadError,
} from "./ui/SettingsPrimitives";

export default function NotificationsSection() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [testingChannel, setTestingChannel] = useState(null);
  const [testResult, setTestResult] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await settings.getNotificationSettings();
      setPrefs(data);
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
      const { data } = await settings.updateNotificationSettings(prefs);
      setPrefs(data);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setTimeout(() => setSaveStatus("idle"), 2500);
    }
  }

  async function handleTest(channel) {
    setTestingChannel(channel);
    setTestResult((prev) => ({ ...prev, [channel]: null }));
    try {
      await settings.testWebhook(channel);
      setTestResult((prev) => ({ ...prev, [channel]: "ok" }));
    } catch {
      setTestResult((prev) => ({ ...prev, [channel]: "error" }));
    } finally {
      setTestingChannel(null);
      setTimeout(() => setTestResult((prev) => ({ ...prev, [channel]: null })), 3000);
    }
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (loadError) return <LoadError message={loadError} onRetry={load} />;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <WebhookChannelCard
        icon={Slack}
        title="Slack"
        description="Post alerts to a Slack channel via an incoming webhook."
        url={prefs.slack.webhookUrl}
        onUrlChange={(v) => setPrefs({ ...prefs, slack: { ...prefs.slack, webhookUrl: v } })}
        onTest={() => handleTest("slack")}
        testing={testingChannel === "slack"}
        testResult={testResult.slack}
      >
        <Toggle
          checked={prefs.slack.notifyOnHandover}
          onChange={(v) => setPrefs({ ...prefs, slack: { ...prefs.slack, notifyOnHandover: v } })}
          label="Notify on human handover"
        />
        <Toggle
          checked={prefs.slack.notifyOnOrderUpdate}
          onChange={(v) => setPrefs({ ...prefs, slack: { ...prefs.slack, notifyOnOrderUpdate: v } })}
          label="Notify on order status updates"
        />
      </WebhookChannelCard>

      <WebhookChannelCard
        icon={Hash}
        title="Discord"
        description="Post alerts to a Discord channel via an incoming webhook."
        url={prefs.discord.webhookUrl}
        onUrlChange={(v) => setPrefs({ ...prefs, discord: { ...prefs.discord, webhookUrl: v } })}
        onTest={() => handleTest("discord")}
        testing={testingChannel === "discord"}
        testResult={testResult.discord}
      >
        <Toggle
          checked={prefs.discord.notifyOnHandover}
          onChange={(v) => setPrefs({ ...prefs, discord: { ...prefs.discord, notifyOnHandover: v } })}
          label="Notify on human handover"
        />
        <Toggle
          checked={prefs.discord.notifyOnOrderUpdate}
          onChange={(v) => setPrefs({ ...prefs, discord: { ...prefs.discord, notifyOnOrderUpdate: v } })}
          label="Notify on order status updates"
        />
      </WebhookChannelCard>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saveStatus === "saving"}>
          Save changes
        </Button>
        <SaveStatus status={saveStatus} />
      </div>
    </form>
  );
}

function WebhookChannelCard({ icon: Icon, title, description, url, onUrlChange, onTest, testing, testResult, children }) {
  return (
    <SectionCard title={title} description={description} icon={Icon}>
      <div className="space-y-4">
        <Field label="Webhook URL" htmlFor={`${title}-url`}>
          <div className="flex gap-2">
            <TextInput
              id={`${title}-url`}
              placeholder="https://hooks.slack.com/services/…"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
            />
            <Button type="button" variant="secondary" size="sm" loading={testing} disabled={!url} onClick={onTest}>
              <Send size={13} /> Test
            </Button>
          </div>
          {testResult === "ok" && <p className="mt-1 text-xs text-emerald-400">Test message sent.</p>}
          {testResult === "error" && <p className="mt-1 text-xs text-red-400">Couldn't reach that webhook.</p>}
        </Field>
        <div className="space-y-3">{children}</div>
      </div>
    </SectionCard>
  );
}
