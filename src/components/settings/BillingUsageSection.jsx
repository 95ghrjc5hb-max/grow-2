import React, { useEffect, useState } from "react";
import { CreditCard, Zap, MessageSquare, Calendar, FileText, ExternalLink, X, Check, ShoppingBag } from "lucide-react";
import { settings } from "../../api/GrowClient"; 
import { SectionCard, Badge, Button, SectionSkeleton } from "./ui/SettingsPrimitives";

const getMetaPriceLabel = (plan) => {
    if (!plan || plan === 'Grow Free') return '$0/mo';
    if (plan.includes('Premium')) return '$59/mo';
    if (plan.includes('Unlimited')) return '$100/mo';
    return '$29/mo';
};

const getShopifyPriceLabel = (plan) => {
    if (!plan || plan === 'Grow Free') return '$0/mo';
    if (plan.includes('Premium')) return '$30/mo';
    if (plan.includes('Unlimited')) return '$60/mo';
    return '$15/mo';
};

export default function BillingUsageSection() {
    const [metaUsage, setMetaUsage] = useState({
        planName: 'Grow Free',
        status: 'Active',
        renewsAt: null,
        priceLabel: '$0/mo',
        customerLimit: 10,
        customersUsed: 0
    });

    const [shopifyUsage, setShopifyUsage] = useState({
        planName: 'Grow Free',
        status: 'Active',
        renewsAt: null,
        priceLabel: '$0/mo',
        messageLimit: 100,
        messagesUsed: 0
    });

    const [stats, setStats] = useState({ activeChats: 0, chatsThisMonth: 0 });
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [activeModal, setActiveModal] = useState(null);
    const [updatingPlan, setUpdatingPlan] = useState(null);

    const fetchBillingData = async () => {
        try {
            const [usageRes, invoicesRes] = await Promise.all([
                settings.getBillingUsage(),
                settings.getInvoices()
            ]);
            
            if (usageRes?.data) {
                const billingInfo = usageRes.data.data || usageRes.data;
                
                const metaPlan = billingInfo.meta_plan || billingInfo.metaPlan || 'Grow Free';
                const shopifyPlan = billingInfo.shopify_plan || billingInfo.shopifyPlan || 'Grow Free';

                setMetaUsage({
                    planName: metaPlan,
                    status: billingInfo.meta_status || billingInfo.metaStatus || 'Active',
                    renewsAt: metaPlan === 'Grow Free' ? null : (billingInfo.meta_renews_at || billingInfo.renewsAt || 'N/A'),
                    priceLabel: billingInfo.meta_price_label || getMetaPriceLabel(metaPlan),
                    customerLimit: billingInfo.meta_customers_limit || billingInfo.metaCustomerLimit || 10,
                    customersUsed: billingInfo.meta_customers_used || billingInfo.metaCustomersUsed || 0
                });

                setShopifyUsage({
                    planName: shopifyPlan,
                    status: billingInfo.shopify_status || billingInfo.shopifyStatus || 'Active',
                    renewsAt: shopifyPlan === 'Grow Free' ? null : (billingInfo.shopify_renews_at || billingInfo.renewsAt || 'N/A'),
                    priceLabel: billingInfo.shopify_price_label || getShopifyPriceLabel(shopifyPlan),
                    messageLimit: billingInfo.shopify_messages_limit || billingInfo.shopifyMessageLimit || 100,
                    messagesUsed: billingInfo.shopify_messages_used || billingInfo.shopifyMessagesUsed || 0
                });

                setStats({
                    activeChats: billingInfo.activeChats || billingInfo.active_chats || 0,
                    chatsThisMonth: billingInfo.chatsThisMonth || billingInfo.chats_this_month || 0
                });
            }
            
            if (invoicesRes?.data) {
                setInvoices(invoicesRes.data);
            }
        } catch (error) {
            console.error("Failed to load billing usage:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBillingData();

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        let liveChannel = null;
        if (supabaseUrl && supabaseKey) {
            import('@supabase/supabase-js').then(({ createClient }) => {
                const supabase = createClient(supabaseUrl, supabaseKey);
                liveChannel = supabase
                    .channel('live-billing-updates')
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'billing_accounts' }, () => {
                        fetchBillingData(); 
                    })
                    .subscribe();
            });
        }

        return () => {
            if (liveChannel) liveChannel.unsubscribe();
        };
    }, []);

   const handleUpgradePlan = async (selectedPlan, price) => {
    setUpdatingPlan(selectedPlan);
    try {
        if (activeModal === 'shopify') {
            // Shopify Billing
            const res = await settings.updateShopifyPlan({ provider: 'shopify', planName: selectedPlan, price: price });
            const confirmationUrl = res?.data?.confirmationUrl || res?.confirmationUrl;
            
            if (confirmationUrl) {
                window.location.href = confirmationUrl;
            } else {
                alert("Shopify Billing initialization failed.");
                setUpdatingPlan(null);
            }
        } else {
            // Meta Suite (Lemon Squeezy) Billing
            const res = await settings.updateMetaPlan({ provider: 'lemonsqueezy', planName: selectedPlan, price: price });
            const checkoutUrl = res?.data?.url || res?.url;
            
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                alert("Lemon Squeezy checkout link is pending setup.");
                setUpdatingPlan(null);
            }
        }
    } catch (error) {
        console.error("Billing upgrade error:", error);
        alert("Payment gateway error. Please try again.");
        setUpdatingPlan(null);
    }
};
    

    if (loading) return <SectionSkeleton blocks={4} />;

    const metaUsagePct = metaUsage.customerLimit > 0 ? Math.min(Math.round((metaUsage.customersUsed / metaUsage.customerLimit) * 100), 100) : 0;
    const isMetaLimitReached = metaUsagePct >= 100;
    const isMetaExpired = metaUsage.status.toLowerCase() === 'expired';

    const shopifyUsagePct = shopifyUsage.messageLimit > 0 ? Math.min(Math.round((shopifyUsage.messagesUsed / shopifyUsage.messageLimit) * 100), 100) : 0;
    const isShopifyLimitReached = shopifyUsagePct >= 100;
    const isShopifyExpired = shopifyUsage.status.toLowerCase() === 'expired';

    const currentPlanName = activeModal === 'meta' ? metaUsage.planName : shopifyUsage.planName;
    const currentLimitReached = activeModal === 'meta' ? isMetaLimitReached : isShopifyLimitReached;
    const currentExpired = activeModal === 'meta' ? isMetaExpired : isShopifyExpired;

    return (
        <div className="space-y-8 max-w-4xl">
            
            {/* 1. META SUITE SECTION */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <MessageSquare className="w-5 h-5 text-blue-400" />
                    <h2 className="text-base font-semibold text-slate-200">Meta Suite (Messenger, Instagram, WhatsApp)</h2>
                </div>

                <SectionCard title="Meta Plan" icon={CreditCard}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-lg font-semibold text-slate-200">{metaUsage.planName}</h3>
                                <Badge tone={metaUsage.status.toLowerCase() === 'active' ? 'success' : isMetaExpired ? 'critical' : 'neutral'}>
                                    {metaUsage.status}
                                </Badge>
                            </div>
                            <p className="text-sm text-slate-400">
                                {metaUsage.planName === 'Grow Free' 
                                    ? 'Free Tier - $0/mo' 
                                    : `Renews ${metaUsage.renewsAt} - ${metaUsage.priceLabel}`}
                            </p>
                        </div>
                        
                        <Button variant="secondary" size="sm" onClick={() => setActiveModal('meta')}>
                            <span className="flex items-center">
                                Manage plan <ExternalLink size={14} className="ml-2 text-slate-400" />
                            </span>
                        </Button>
                    </div>
                </SectionCard>

                <SectionCard title="AI Customer Usage" icon={Zap} description="Meta Channels Unique Customers">
                    <div className="mt-2">
                        <div className="flex items-center justify-between text-sm font-medium text-slate-300 mb-2">
                            <span>{metaUsage.customersUsed} / {metaUsage.customerLimit.toLocaleString()} Customers</span>
                            <span>{metaUsagePct}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                            <div 
                                className={`h-2.5 rounded-full transition-all duration-500 ${metaUsagePct > 90 ? 'bg-red-500' : metaUsagePct > 75 ? 'bg-amber-500' : 'bg-blue-500'}`} 
                                style={{ width: `${metaUsagePct}%` }}
                            ></div>
                        </div>
                        {isMetaLimitReached && !isMetaExpired && (
                            <p className="text-xs text-red-400 mt-2 font-medium">Meta customer limit reached! Please upgrade to continue using AI.</p>
                        )}
                    </div>
                </SectionCard>
            </div>

            {/* 2. SHOPIFY STOREFRONT SECTION */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <ShoppingBag className="w-5 h-5 text-teal-400" />
                    <h2 className="text-base font-semibold text-slate-200">Shopify Storefront AI Widget</h2>
                </div>

                <SectionCard title="Shopify Plan" icon={CreditCard}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-lg font-semibold text-slate-200">{shopifyUsage.planName}</h3>
                                <Badge tone={shopifyUsage.status.toLowerCase() === 'active' ? 'success' : isShopifyExpired ? 'critical' : 'neutral'}>
                                    {shopifyUsage.status}
                                </Badge>
                            </div>
                            <p className="text-sm text-slate-400">
                                {shopifyUsage.planName === 'Grow Free' 
                                    ? 'Free Tier - $0/mo' 
                                    : `Renews ${shopifyUsage.renewsAt} - ${shopifyUsage.priceLabel}`}
                            </p>
                        </div>
                        
                        <Button variant="secondary" size="sm" onClick={() => setActiveModal('shopify')}>
                            <span className="flex items-center">
                                Manage plan <ExternalLink size={14} className="ml-2 text-slate-400" />
                            </span>
                        </Button>
                    </div>
                </SectionCard>

                <SectionCard title="AI Message Usage" icon={Zap} description="Shopify Storefront Conversations">
                    <div className="mt-2">
                        <div className="flex items-center justify-between text-sm font-medium text-slate-300 mb-2">
                            <span>{shopifyUsage.messagesUsed} / {shopifyUsage.messageLimit.toLocaleString()} Messages</span>
                            <span>{shopifyUsagePct}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                            <div 
                                className={`h-2.5 rounded-full transition-all duration-500 ${shopifyUsagePct > 90 ? 'bg-red-500' : shopifyUsagePct > 75 ? 'bg-teal-500' : 'bg-teal-500'}`} 
                                style={{ width: `${shopifyUsagePct}%` }}
                            ></div>
                        </div>
                        {isShopifyLimitReached && !isShopifyExpired && (
                            <p className="text-xs text-red-400 mt-2 font-medium">Shopify message limit reached! Please upgrade your plan.</p>
                        )}
                    </div>
                </SectionCard>
            </div>

            {/* Chat Statistics Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <SectionCard title="ACTIVE CHATS" icon={MessageSquare}>
                    <p className="text-3xl font-bold text-slate-200 mt-2">{stats.activeChats}</p>
                </SectionCard>
                <SectionCard title="CHATS THIS MONTH" icon={Calendar}>
                    <p className="text-3xl font-bold text-slate-200 mt-2">{stats.chatsThisMonth}</p>
                </SectionCard>
            </div>

            {/* Invoices History Section */}
            <SectionCard title="Invoices" icon={FileText}>
                {invoices.length === 0 ? (
                    <div className="py-8 text-center bg-slate-900/50 rounded-lg border border-slate-800 border-dashed">
                        <FileText className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">No invoices yet</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800">
                        {invoices.map((invoice) => (
                            <div key={invoice.id} className="py-3 flex justify-between items-center text-sm">
                                <span className="text-slate-300">{invoice.date}</span>
                                <span className="font-medium text-slate-200">${invoice.amount}</span>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            {/* DYNAMIC PRICING MODAL */}
            {activeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                        
                        <div className="p-6 border-b border-slate-800 text-center">
                            <h2 className="text-2xl font-bold text-white">
                                Upgrade {activeModal === 'meta' ? 'Meta Suite' : 'Shopify Storefront Widget'}
                            </h2>
                            <p className="text-slate-400 mt-1">
                                {activeModal === 'meta' ? 'Billed via Lemon Squeezy' : 'Billed natively via Shopify Subscription'}
                            </p>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            
                            {/* Package 1: Pro */}
                            <div className="border border-slate-700 bg-slate-800/50 rounded-lg p-5 flex flex-col hover:border-teal-500/50 transition-colors">
                                <h3 className="text-lg font-semibold text-white">Grow Pro</h3>
                                <div className="text-3xl font-bold text-white my-2">
                                    {activeModal === 'meta' ? '$29' : '$15'}
                                    <span className="text-sm font-normal text-slate-400">/mo</span>
                                </div>
                                <p className="text-sm text-slate-400 mb-4 border-b border-slate-700 pb-4">Best for small businesses.</p>
                                <ul className="text-sm text-slate-300 space-y-2 mb-6 flex-1">
                                    <li className="flex items-center">
                                        <Check size={16} className="text-teal-500 mr-2" /> 
                                        {activeModal === 'meta' ? '500 Customers / mo' : '2,000 Messages / mo'}
                                    </li>
                                </ul>

                                {currentPlanName === "Grow Pro" && !currentLimitReached && !currentExpired ? (
                                    <Button className="w-full opacity-50 cursor-not-allowed" disabled={true}>
                                        Current Plan
                                    </Button>
                                ) : (
                                    <Button 
                                        className="w-full" 
                                        disabled={updatingPlan !== null} 
                                        onClick={() => handleUpgradePlan("Grow Pro", activeModal === 'meta' ? 29 : 15)}
                                    >
                                        {updatingPlan === "Grow Pro" ? "Processing..." : (currentPlanName === "Grow Pro" && (currentLimitReached || currentExpired) ? "Renew Plan" : "Upgrade to Pro")}
                                    </Button>
                                )}
                            </div>

                            {/* Package 2: Premium */}
                            <div className="border-2 border-teal-500 bg-slate-800 rounded-lg p-5 flex flex-col relative shadow-[0_0_15px_rgba(20,184,166,0.15)]">
                                <div className="absolute top-0 right-0 bg-teal-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-sm uppercase tracking-wider">Popular</div>
                                <h3 className="text-lg font-semibold text-white">Grow Premium</h3>
                                <div className="text-3xl font-bold text-white my-2">
                                    {activeModal === 'meta' ? '$59' : '$30'}
                                    <span className="text-sm font-normal text-slate-400">/mo</span>
                                </div>
                                <p className="text-sm text-slate-400 mb-4 border-b border-slate-700 pb-4">For growing stores.</p>
                                <ul className="text-sm text-slate-300 space-y-2 mb-6 flex-1">
                                    <li className="flex items-center">
                                        <Check size={16} className="text-teal-500 mr-2" /> 
                                        {activeModal === 'meta' ? '1,200 Customers / mo' : '5,000 Messages / mo'}
                                    </li>
                                </ul>

                                {currentPlanName === "Grow Premium" && !currentLimitReached && !currentExpired ? (
                                    <Button className="w-full bg-teal-900 text-teal-200 opacity-60 cursor-not-allowed border-none" disabled={true}>
                                        Current Plan
                                    </Button>
                                ) : (
                                    <Button 
                                        className="w-full bg-teal-600 hover:bg-teal-500 text-white" 
                                        disabled={updatingPlan !== null} 
                                        onClick={() => handleUpgradePlan("Grow Premium", activeModal === 'meta' ? 59 : 30)}
                                    >
                                        {updatingPlan === "Grow Premium" ? "Processing..." : (currentPlanName === "Grow Premium" && (currentLimitReached || currentExpired) ? "Renew Premium" : "Upgrade to Premium")}
                                    </Button>
                                )}
                            </div>

                            {/* Package 3: Unlimited */}
                            <div className="border border-slate-700 bg-slate-800/50 rounded-lg p-5 flex flex-col hover:border-teal-500/50 transition-colors">
                                <h3 className="text-lg font-semibold text-white">Grow Unlimited</h3>
                                <div className="text-3xl font-bold text-white my-2">
                                    {activeModal === 'meta' ? '$100' : '$60'}
                                    <span className="text-sm font-normal text-slate-400">/mo</span>
                                </div>
                                <p className="text-sm text-slate-400 mb-4 border-b border-slate-700 pb-4">Max power and scale.</p>
                                <ul className="text-sm text-slate-300 space-y-2 mb-6 flex-1">
                                    <li className="flex items-center">
                                        <Check size={16} className="text-teal-500 mr-2" /> 
                                        {activeModal === 'meta' ? '3,000 Customers / mo' : '10,000 Messages / mo'}
                                    </li>
                                </ul>

                                {currentPlanName === "Grow Unlimited" && !currentLimitReached && !currentExpired ? (
                                    <Button className="w-full opacity-50 cursor-not-allowed" disabled={true}>
                                        Current Plan
                                    </Button>
                                ) : (
                                    <Button 
                                        className="w-full" 
                                        disabled={updatingPlan !== null} 
                                        onClick={() => handleUpgradePlan("Grow Unlimited", activeModal === 'meta' ? 100 : 60)}
                                    >
                                        {updatingPlan === "Grow Unlimited" ? "Processing..." : (currentPlanName === "Grow Unlimited" && (currentLimitReached || currentExpired) ? "Renew Unlimited" : "Upgrade to Unlimited")}
                                    </Button>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}