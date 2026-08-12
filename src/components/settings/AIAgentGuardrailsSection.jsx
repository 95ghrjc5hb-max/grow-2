import { useEffect, useState, useCallback } from "react";
import { Bot, ShieldAlert, X, Plus } from "lucide-react";
import { settings } from "../../api/GrowClient";
import {
  SectionCard,
  Field,
  TextInput,
  TextArea,
  Select,
  Button,
  SaveStatus,
  SectionSkeleton,
  LoadError,
} from "./ui/SettingsPrimitives";

export default function AIAgentGuardrailsSection() {
  const [config, setConfig] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [newTopic, setNewTopic] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [configRes, modelsRes] = await Promise.all([
        settings.getAIAgentConfig(),
        settings.getAvailableModels(),
      ]);
      setConfig(configRes.data);
      setModels(modelsRes.data ?? []);
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
      const { data } = await settings.updateAIAgentConfig({
        model: config.model,
        systemPrompt: config.systemPrompt,
        persona: config.persona,
        restrictedTopics: config.restrictedTopics,
        confidenceThreshold: config.confidenceThreshold,
      });
      setConfig(data);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setTimeout(() => setSaveStatus("idle"), 2500);
    }
  }

  function addTopic() {
    const topic = newTopic.trim();
    if (!topic || config.restrictedTopics.includes(topic)) return;
    setConfig({ ...config, restrictedTopics: [...config.restrictedTopics, topic] });
    setNewTopic("");
  }

  function removeTopic(topic) {
    setConfig({ ...config, restrictedTopics: config.restrictedTopics.filter((t) => t !== topic) });
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (loadError) return <LoadError message={loadError} onRetry={load} />;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Model" description="Which Groq-hosted model answers customer conversations." icon={Bot}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model" htmlFor="model" hint="Faster models cost less but may need a lower confidence threshold.">
            <Select id="model" value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Confidence threshold (${Math.round(config.confidenceThreshold * 100)}%)`}
            htmlFor="confidence"
            hint="Below this, the agent hands off to a human instead of guessing."
          >
            <input
              id="confidence"
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              value={config.confidenceThreshold}
              onChange={(e) => setConfig({ ...config, confidenceThreshold: Number(e.target.value) })}
              className="w-full accent-teal-500"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Persona & system prompt" description="Defines how the agent introduces itself and behaves." icon={Bot}>
        <div className="grid gap-4">
          <Field label="Persona name" htmlFor="persona" hint='e.g. "Aiva, your shopping assistant"'>
            <TextInput
              id="persona"
              value={config.persona}
              onChange={(e) => setConfig({ ...config, persona: e.target.value })}
            />
          </Field>
          <Field label="System prompt" htmlFor="systemPrompt" hint="Instructions sent with every conversation.">
            <TextArea
              id="systemPrompt"
              rows={6}
              value={config.systemPrompt}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Restricted topics" description="The agent refuses these topics and offers a human handover instead." icon={ShieldAlert}>
        <div className="mb-3 flex flex-wrap gap-2">
          {config.restrictedTopics.length === 0 && (
            <p className="text-sm text-slate-500">No restricted topics yet.</p>
          )}
          {config.restrictedTopics.map((topic) => (
            <span
              key={topic}
              className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300"
            >
              {topic}
              <button
                type="button"
                onClick={() => removeTopic(topic)}
                aria-label={`Remove ${topic}`}
                className="text-slate-500 hover:text-red-400"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <TextInput
            placeholder="e.g. medical advice, refund exceptions"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTopic();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addTopic}>
            <Plus size={14} /> Add
          </Button>
        </div>
      </SectionCard>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saveStatus === "saving"}>
          Save changes
        </Button>
        <SaveStatus status={saveStatus} />
      </div>
    </form>
  );
}
