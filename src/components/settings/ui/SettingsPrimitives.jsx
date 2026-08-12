import { Loader2, Check, AlertTriangle } from "lucide-react";

/**
 * Shared building blocks for the settings screens.
 *
 * Why this file exists:
 * All 9 section components need the same card shell, form field, toggle,
 * and save-button-with-status pattern. Duplicating that markup 9x makes
 * every future style tweak a 9-file change. Centralizing it here means
 * the whole Settings area re-themes from one place.
 */

export function SectionCard({ title, description, icon: Icon, children, className = "" }) {
  return (
    <section
      className={`rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm shadow-black/20 ${className}`}
    >
      {(title || description) && (
        <header className="flex items-start gap-3 border-b border-slate-800 px-6 py-5">
          {Icon && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
              <Icon size={18} strokeWidth={2} />
            </span>
          )}
          <div>
            {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export function Field({ label, htmlFor, hint, error, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-400">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className = "", invalid = false, ...props }) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border bg-slate-950/60 px-3 py-2 text-sm text-slate-100
        placeholder:text-slate-600 outline-none transition-colors
        focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50
        ${invalid ? "border-red-500/60" : "border-slate-800"} ${className}`}
    />
  );
}

export function TextArea({ className = "", ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full resize-y rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm
        text-slate-100 placeholder:text-slate-600 outline-none transition-colors
        focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 ${className}`}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm
        text-slate-100 outline-none transition-colors focus:border-teal-500
        focus:ring-1 focus:ring-teal-500/50 ${className}`}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span>
        {label && <span className="block text-sm font-medium text-slate-200">{label}</span>}
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
          focus:outline-none focus:ring-2 focus:ring-teal-500/50
          ${checked ? "bg-teal-500" : "bg-slate-700"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
    </label>
  );
}

export function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: "bg-slate-800 text-slate-300",
    success: "bg-emerald-500/10 text-emerald-400",
    warning: "bg-amber-500/10 text-amber-400",
    danger: "bg-red-500/10 text-red-400",
    info: "bg-teal-500/10 text-teal-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({ variant = "primary", size = "md", loading = false, children, className = "", ...props }) {
  const variants = {
    primary: "bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:bg-teal-500/40",
    secondary: "bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:bg-slate-800/50",
    danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40",
    ghost: "text-slate-300 hover:bg-slate-800",
  };
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-sm" };

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors
        disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

/** Small inline status used next to a Save button: idle | saving | saved | error */
export function SaveStatus({ status }) {
  if (status === "saving") return <span className="text-xs text-slate-500">Saving…</span>;
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <Check size={13} /> Saved
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-red-400">
        <AlertTriangle size={13} /> Couldn't save
      </span>
    );
  return null;
}

/** Reused by every section while its initial GET request is in flight. */
export function SectionSkeleton({ blocks = 2 }) {
  return (
    <div className="space-y-6">
      {[...Array(blocks)].map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border border-slate-800 bg-slate-900/40" />
      ))}
    </div>
  );
}

/** Reused by every section when its initial GET request fails. */
export function LoadError({ message, onRetry }) {
  return (
    <SectionCard>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-red-400">Couldn't load this section. {message}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 px-6 py-10 text-center">
      {Icon && <Icon size={22} className="text-slate-600" />}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="max-w-xs text-xs text-slate-500">{description}</p>}
      {action}
    </div>
  );
}
