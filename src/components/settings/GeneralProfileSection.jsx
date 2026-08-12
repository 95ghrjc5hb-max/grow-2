import { useEffect, useState, useCallback } from "react";
import { UserCircle, ShieldCheck, Monitor, Smartphone, LogOut } from "lucide-react";
import { settings } from "../../api/GrowClient";
import {
  SectionCard,
  Field,
  TextInput,
  Toggle,
  Button,
  SaveStatus,
  Badge,
  SectionSkeleton,
  LoadError,
} from "./ui/SettingsPrimitives";

export default function GeneralProfileSection() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [profileSaveStatus, setProfileSaveStatus] = useState("idle");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState(null);
  const [passwordStatus, setPasswordStatus] = useState("idle");

  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFABusy, setTwoFABusy] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [revokingId, setRevokingId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [profileRes, sessionsRes] = await Promise.all([
        settings.getProfile(),
        settings.getSessions(),
      ]);
      setProfile(profileRes.data);
      setTwoFAEnabled(Boolean(profileRes.data?.twoFactorEnabled));
      setSessions(sessionsRes.data ?? []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSaveStatus("saving");
    try {
      const { data } = await settings.updateProfile({
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
      });
      setProfile(data);
      setProfileSaveStatus("saved");
    } catch {
      setProfileSaveStatus("error");
    } finally {
      setTimeout(() => setProfileSaveStatus("idle"), 2500);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError(null);

    if (passwordForm.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }

    setPasswordStatus("saving");
    try {
      await settings.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordStatus("saved");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPasswordStatus("error");
      setPasswordError(err.message || "Couldn't update password.");
    } finally {
      setTimeout(() => setPasswordStatus("idle"), 2500);
    }
  }

  async function handleToggle2FA(next) {
    setTwoFABusy(true);
    const previous = twoFAEnabled;
    setTwoFAEnabled(next); // optimistic
    try {
      await settings.toggle2FA(next);
    } catch {
      setTwoFAEnabled(previous); // revert on failure
    } finally {
      setTwoFABusy(false);
    }
  }

  async function handleRevokeSession(sessionId) {
    setRevokingId(sessionId);
    try {
      await settings.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) return <SectionSkeleton blocks={4} />;
  if (loadError) return <LoadError message={loadError} onRetry={loadAll} />;

  return (
    <div className="space-y-6">
      {/* Profile details */}
      <SectionCard
        title="Profile details"
        description="Your name and contact info, as seen by teammates in this workspace."
        icon={UserCircle}
      >
        <form onSubmit={handleProfileSave} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName">
            <TextInput
              id="fullName"
              value={profile.fullName || ""}
              onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
              required
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              value={profile.email || ""}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="Used for handover alerts if SMS is enabled.">
            <TextInput
              id="phone"
              type="tel"
              value={profile.phone || ""}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <TextInput value={profile.role || "Member"} disabled className="opacity-60" />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" loading={profileSaveStatus === "saving"}>
              Save changes
            </Button>
            <SaveStatus status={profileSaveStatus} />
          </div>
        </form>
      </SectionCard>

      {/* Password */}
      <SectionCard title="Password" description="Change the password used to sign in." icon={ShieldCheck}>
        <form onSubmit={handlePasswordSubmit} className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <TextInput
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              required
            />
          </Field>
          <Field label="New password">
            <TextInput
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              required
            />
          </Field>
          <Field label="Confirm new password" error={passwordError}>
            <TextInput
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              required
            />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Button type="submit" loading={passwordStatus === "saving"}>
              Update password
            </Button>
            <SaveStatus status={passwordStatus} />
          </div>
        </form>
      </SectionCard>

      {/* 2FA */}
      <SectionCard title="Two-factor authentication" icon={ShieldCheck}>
        <Toggle
          checked={twoFAEnabled}
          disabled={twoFABusy}
          onChange={handleToggle2FA}
          label="Require a one-time code at sign-in"
          description="Adds an extra step using your authenticator app."
        />
      </SectionCard>

      {/* Active sessions */}
      <SectionCard
        title="Active sessions"
        description="Devices currently signed in to your account."
        icon={Monitor}
      >
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No other active sessions.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  {session.deviceType === "mobile" ? (
                    <Smartphone size={18} className="text-slate-500" />
                  ) : (
                    <Monitor size={18} className="text-slate-500" />
                  )}
                  <div>
                    <p className="text-sm text-slate-200">
                      {session.browser} · {session.os}
                      {session.isCurrent && (
                        <span className="ml-2">
                          <Badge tone="success">This device</Badge>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {session.location} · last active {session.lastActiveAt}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={revokingId === session.id}
                    onClick={() => handleRevokeSession(session.id)}
                  >
                    <LogOut size={14} /> Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}


