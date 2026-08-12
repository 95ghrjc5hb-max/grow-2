import { useEffect, useState, useCallback } from "react";
import { Users, UserPlus, Clock, ArrowUpRight, Trash2 } from "lucide-react";
import { settings } from "../../api/GrowClient";
import {
  SectionCard,
  Field,
  TextInput,
  Select,
  Toggle,
  Button,
  SaveStatus,
  Badge,
  SectionSkeleton,
  LoadError,
} from "./ui/SettingsPrimitives";

const ROLES = ["owner", "admin", "agent"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TeamEscalationsSection() {
  const [members, setMembers] = useState([]);
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteStatus, setInviteStatus] = useState("idle");
  const [inviteError, setInviteError] = useState(null);

  const [rulesSaveStatus, setRulesSaveStatus] = useState("idle");
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [membersRes, rulesRes] = await Promise.all([
        settings.getTeamMembers(),
        settings.getEscalationRules(),
      ]);
      setMembers(membersRes.data ?? []);
      setRules(rulesRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e) {
    e.preventDefault();
    setInviteError(null);
    setInviteStatus("saving");
    try {
      const { data } = await settings.inviteTeamMember({ email: inviteEmail, role: inviteRole });
      setMembers((prev) => [...prev, data]);
      setInviteEmail("");
      setInviteStatus("saved");
    } catch (err) {
      setInviteStatus("error");
      setInviteError(err.message || "Couldn't send invite.");
    } finally {
      setTimeout(() => setInviteStatus("idle"), 2000);
    }
  }

  async function handleRoleChange(memberId, role) {
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    await settings.updateTeamMember(memberId, { role });
  }

  async function handleRemove(memberId) {
    setRemovingId(memberId);
    try {
      await settings.removeTeamMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } finally {
      setRemovingId(null);
    }
  }

  function toggleWorkingDay(day) {
    const days = rules.workingHours.days.includes(day)
      ? rules.workingHours.days.filter((d) => d !== day)
      : [...rules.workingHours.days, day];
    setRules({ ...rules, workingHours: { ...rules.workingHours, days } });
  }

  async function handleSaveRules(e) {
    e.preventDefault();
    setRulesSaveStatus("saving");
    try {
      const { data } = await settings.updateEscalationRules(rules);
      setRules(data);
      setRulesSaveStatus("saved");
    } catch {
      setRulesSaveStatus("error");
    } finally {
      setTimeout(() => setRulesSaveStatus("idle"), 2500);
    }
  }

  if (loading) return <SectionSkeleton blocks={3} />;
  if (loadError) return <LoadError message={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      {/* Team members */}
      <SectionCard title="Team members" description="Who has access to this workspace and what they can do." icon={Users}>
        <form onSubmit={handleInvite} className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Invite by email" htmlFor="inviteEmail" error={inviteError} className="flex-1 min-w-[220px]">
            <TextInput
              id="inviteEmail"
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Role" htmlFor="inviteRole">
            <Select id="inviteRole" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={inviteStatus === "saving"}>
            <UserPlus size={14} /> Invite
          </Button>
        </form>

        <ul className="divide-y divide-slate-800">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm text-slate-200">{member.fullName || member.email}</p>
                <p className="text-xs text-slate-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {member.status === "pending" && <Badge tone="warning">Pending</Badge>}
                <Select
                  value={member.role}
                  disabled={member.role === "owner"}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  className="w-32"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r[0].toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </Select>
                {member.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={removingId === member.id}
                    onClick={() => handleRemove(member.id)}
                    aria-label={`Remove ${member.email}`}
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Escalation rules */}
      <form onSubmit={handleSaveRules}>
        <SectionCard title="Working hours" description="Outside these hours, handovers queue instead of paging the team." icon={Clock}>
          <div className="mb-4 flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleWorkingDay(day)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  rules.workingHours.days.includes(day)
                    ? "bg-teal-500/10 text-teal-400"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time">
              <TextInput
                type="time"
                value={rules.workingHours.start}
                onChange={(e) =>
                  setRules({ ...rules, workingHours: { ...rules.workingHours, start: e.target.value } })
                }
              />
            </Field>
            <Field label="End time">
              <TextInput
                type="time"
                value={rules.workingHours.end}
                onChange={(e) =>
                  setRules({ ...rules, workingHours: { ...rules.workingHours, end: e.target.value } })
                }
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Handover rules" description="When the AI agent should bring in a human." icon={ArrowUpRight} className="mt-6">
          <div className="space-y-4">
            <Toggle
              checked={rules.handoverOnLowConfidence}
              onChange={(v) => setRules({ ...rules, handoverOnLowConfidence: v })}
              label="Hand over on low confidence"
              description="Uses the confidence threshold set in AI Agent Guardrails."
            />
            <Toggle
              checked={rules.handoverOnNegativeSentiment}
              onChange={(v) => setRules({ ...rules, handoverOnNegativeSentiment: v })}
              label="Hand over on frustrated or angry customers"
            />
            <Toggle
              checked={rules.handoverOnRefundRequest}
              onChange={(v) => setRules({ ...rules, handoverOnRefundRequest: v })}
              label="Hand over on refund or cancellation requests"
            />
            <Field label="Max agent replies before forced handover" htmlFor="maxReplies">
              <TextInput
                id="maxReplies"
                type="number"
                min={1}
                max={20}
                value={rules.maxRepliesBeforeHandover}
                onChange={(e) => setRules({ ...rules, maxRepliesBeforeHandover: Number(e.target.value) })}
                className="w-24"
              />
            </Field>
          </div>
        </SectionCard>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" loading={rulesSaveStatus === "saving"}>
            Save changes
          </Button>
          <SaveStatus status={rulesSaveStatus} />
        </div>
      </form>
    </div>
  );
}
