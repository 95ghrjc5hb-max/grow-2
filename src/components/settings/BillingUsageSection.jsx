import { useEffect, useState, useCallback } from "react";
import { CreditCard, Zap, MessageSquare, FileText, ExternalLink } from "lucide-react";
import { settings } from "../../api/GrowClient";
import { SectionCard, Badge, Button, SectionSkeleton, LoadError, EmptyState } from "./ui/SettingsPrimitives";

export default function BillingUsageSection() {
  const [billing, setBilling] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [billingRes, invoicesRes] = await Promise.all([
        settings.getBillingUsage(),
        settings.getInvoices(),
      ]);
      setBilling(billingRes.data);
      setInvoices(invoicesRes.data ?? []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <SectionSkeleton blocks={2} />;
  if (loadError) return <LoadError message={loadError} onRetry={load} />;

  const tokenPct = Math.min(100, Math.round((billing.tokensUsed / billing.tokenLimit) * 100));
  const nearLimit = tokenPct >= 85;

  return (
    <div className="space-y-6">
      <SectionCard title="Plan" icon={CreditCard}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-slate-100">{billing.planName}</p>
              <Badge tone={billing.status === "active" ? "success" : "warning"}>
                {billing.status === "active" ? "Active" : billing.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Renews {billing.renewsAt} · {billing.priceLabel}
            </p>
          </div>
          <Button variant="secondary" size="sm">
            Manage plan <ExternalLink size={13} />
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="AI token usage" description="This billing period." icon={Zap}>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-slate-100">{billing.tokensUsed.toLocaleString()}</span>
            {" / "}
            {billing.tokenLimit.toLocaleString()} tokens
          </p>
          <span className={`text-xs ${nearLimit ? "text-amber-400" : "text-slate-500"}`}>{tokenPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${nearLimit ? "bg-amber-500" : "bg-teal-500"}`}
            style={{ width: `${tokenPct}%` }}
          />
        </div>
        {nearLimit && (
          <p className="mt-2 text-xs text-amber-400">
            You're close to this period's token limit. Consider upgrading to avoid interruptions.
          </p>
        )}
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard icon={MessageSquare} label="Active chats" value={billing.activeChats} />
        <StatCard icon={MessageSquare} label="Chats this month" value={billing.chatsThisMonth} />
      </div>

      <SectionCard title="Invoices" icon={FileText}>
        {invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices yet" />
        ) : (
          <ul className="divide-y divide-slate-800">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-slate-300">{inv.date}</span>
                <span className="text-slate-500">{inv.amountLabel}</span>
                <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-teal-400 hover:text-teal-300">
                  Download <ExternalLink size={12} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}
