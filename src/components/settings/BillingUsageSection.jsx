import React, { useEffect, useState } from "react";
import { CreditCard, Zap, MessageSquare, Calendar, FileText, ExternalLink, X, Check } from "lucide-react";
import { settings } from "../../api/GrowClient"; 
import { SectionCard, Badge, Button, SectionSkeleton } from "./ui/SettingsPrimitives";

export default function BillingUsageSection() {
    const [usage, setUsage] = useState({
        planName: 'Grow Free',
        status: 'Active',
        renewsAt: 'N/A',
        priceLabel: '$0/mo',
        customerLimit: 30,
        customersUsed: 0,
        activeChats: 0,
        chatsThisMonth: 0
    });
    
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Modal and localized loading state for buttons
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [updatingPlan, setUpdatingPlan] = useState(null);

    const fetchBillingData = async () => {
        try {
            const [usageRes, invoicesRes] = await Promise.all([
                settings.getBillingUsage(),
                settings.getInvoices()
            ]);
            
          if (usageRes?.data) {
        // Safely extract the actual billing object from nested response
        const billingInfo = usageRes.data.data || usageRes.data;
        
        setUsage({
            planName: billingInfo.planName || billingInfo.plan_name || 'Grow Free',
            status: billingInfo.status || 'Active',
            renewsAt: billingInfo.renewsAt || billingInfo.renews_at || 'N/A',
            priceLabel: billingInfo.priceLabel || billingInfo.price_label || '$0/mo',
            // Added snake_case (billingInfo.token_limit & billingInfo.tokens_used)
            customerLimit: billingInfo.customerLimit || billingInfo.tokenLimit || billingInfo.token_limit || 30,
            customersUsed: billingInfo.customersUsed || billingInfo.tokensUsed || billingInfo.tokens_used || 0,
            activeChats: billingInfo.activeChats || 0,
            chatsThisMonth: billingInfo.chatsThisMonth || 0
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
    // 1. Initial Data Fetch
    fetchBillingData();

    // 2. 🚀 TRUE LIVE WEBSOCKET (Facebook/Instagram Style)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
        // Dynamically import supabase to prevent breaking your current imports
        import('@supabase/supabase-js').then(({ createClient }) => {
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Create a live listener channel
            const liveChannel = supabase
                .channel('live-billing-updates')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE', // Listen specifically for updates
                        schema: 'public',
                        table: 'billing_accounts',
                    },
                    (payload) => {
                        console.log('⚡ [TRUE LIVE] Database Changed! Instant Update:', payload.new);
                        // The moment DB updates, fetch the new data instantly!
                        fetchBillingData(); 
                    }
                )
                .subscribe();

            // Cleanup the WebSocket connection when leaving the page
            return () => {
                supabase.removeChannel(liveChannel);
            };
        });
    } else {
        console.warn("⚠️ Supabase keys missing in frontend .env! Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    }
  }, []);

    const handleUpgradePlan = async (newPlanName) => {
    // 1. Set the exact plan name so the button says "Processing..." correctly
    setUpdatingPlan(newPlanName); 
    
    try {
      // Fetch Stripe Checkout URL from backend
      const res = await settings.updatePlan(newPlanName);
      
      // 2. Check for the URL in both possible response structures
      const checkoutUrl = res?.data?.url || res?.url;

      if (checkoutUrl) {
        // Redirect user to the secure Stripe payment page
        window.location.href = checkoutUrl;
      } else {
        // Stop loading and warn the user if no URL is found
        console.error("Missing URL in response:", res);
        alert("Payment link not found. Please try again.");
        setUpdatingPlan(null); 
      }
    } catch (error) {
      console.error("Failed to initiate checkout:", error);
      alert("Payment gateway error. Please try again.");
      setUpdatingPlan(null); // Stop loading if an error occurs
    }
  };

    const { customerLimit, customersUsed, planName, status, renewsAt, priceLabel, activeChats, chatsThisMonth } = usage;
    
    const usagePercentage = customerLimit > 0 ? Math.min(Math.round((customersUsed / customerLimit) * 100), 100) : 0;
    const isLimitReached = usagePercentage >= 100;
    const isExpired = status.toLowerCase() === 'expired';
    
    // Clean formatting: Removes price from string (e.g., "Grow Pro $29" -> "Grow Pro")
    const displayPlanName = planName.split(' $')[0];

    if (loading) return <SectionSkeleton blocks={3} />;

    return (
        <div className="space-y-6">
            
            {/* Plan Overview Section */}
            <SectionCard title="Plan" icon={CreditCard}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-lg font-semibold text-slate-200">{displayPlanName}</h3>
                            <Badge tone={status.toLowerCase() === 'active' ? 'success' : isExpired ? 'critical' : 'neutral'}>
                                {status}
                            </Badge>
                        </div>
                        <p className="text-sm text-slate-400">Renews {renewsAt} - {priceLabel}</p>
                    </div>
                    
                    <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(true)}>
                        <span className="flex items-center">
                            Manage plan <ExternalLink size={14} className="ml-2 text-slate-400" />
                        </span>
                    </Button>
                </div>
            </SectionCard>

            {/* AI Usage Progress Section */}
            <SectionCard title="AI Customer Usage" icon={Zap} description="This billing period.">
                <div className="mt-4">
                    <div className="flex items-center justify-between text-sm font-medium text-slate-300 mb-2">
                        <span>{customersUsed} / {customerLimit.toLocaleString()} Customers</span>
                        <span>{usagePercentage}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div 
                            className={`h-2.5 rounded-full transition-all duration-500 ${usagePercentage > 90 ? 'bg-red-500' : usagePercentage > 75 ? 'bg-amber-500' : 'bg-teal-500'}`} 
                            style={{ width: `${usagePercentage}%` }}
                        ></div>
                    </div>
                    
                    {/* Intelligent warnings based on usage state */}
                    {isLimitReached && !isExpired && (
                        <p className="text-xs text-red-400 mt-2 font-medium">Limit reached! Please upgrade or renew your plan to continue using AI.</p>
                    )}
                    {isExpired && (
                        <p className="text-xs text-amber-400 mt-2 font-medium">Your plan has expired. Please renew to increase your customer limits.</p>
                    )}
                </div>
            </SectionCard>

            {/* Chat Statistics Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <SectionCard title="ACTIVE CHATS" icon={MessageSquare}>
                    <p className="text-3xl font-bold text-slate-200 mt-2">{activeChats}</p>
                </SectionCard>
                <SectionCard title="CHATS THIS MONTH" icon={Calendar}>
                    <p className="text-3xl font-bold text-slate-200 mt-2">{chatsThisMonth}</p>
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

            {/* Interactive Pricing Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                        
                        <div className="p-6 border-b border-slate-800 text-center">
                            <h2 className="text-2xl font-bold text-white">Upgrade your plan</h2>
                            <p className="text-slate-400 mt-1">Choose the right limits for your business.</p>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            
                            {/* Grow Pro Package */}
                            <div className="border border-slate-700 bg-slate-800/50 rounded-lg p-5 flex flex-col hover:border-teal-500/50 transition-colors">
                                <h3 className="text-lg font-semibold text-white">Grow Pro</h3>
                                <div className="text-3xl font-bold text-white my-2">$29<span className="text-sm font-normal text-slate-400">/mo</span></div>
                                <p className="text-sm text-slate-400 mb-4 border-b border-slate-700 pb-4">Best for small businesses.</p>
                                <ul className="text-sm text-slate-300 space-y-2 mb-6 flex-1">
                                    <li className="flex items-center"><Check size={16} className="text-teal-500 mr-2" /> 500 Customers / mo</li>
                                </ul>
                                
                                {planName === "Grow Pro $29" && !isLimitReached && !isExpired ? (
                                    <Button className="w-full opacity-50 cursor-not-allowed" disabled={true}>
                                        Current Plan
                                    </Button>
                                ) : (
                                    <Button 
                                        className="w-full" 
                                        disabled={updatingPlan !== null} 
                                        onClick={() => handleUpgradePlan("Grow Pro $29")}
                                    >
                                        {updatingPlan === "Grow Pro $29" ? "Processing..." : (planName === "Grow Pro $29" && (isLimitReached || isExpired) ? "Renew Plan" : "Upgrade to Pro")}
                                    </Button>
                                )}
                            </div>

                            {/* Grow Premium Package (Highlighted) */}
                            <div className="border-2 border-teal-500 bg-slate-800 rounded-lg p-5 flex flex-col relative shadow-[0_0_15px_rgba(20,184,166,0.15)]">
                                <div className="absolute top-0 right-0 bg-teal-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-sm uppercase tracking-wider">Popular</div>
                                <h3 className="text-lg font-semibold text-white">Grow Premium</h3>
                                <div className="text-3xl font-bold text-white my-2">$59<span className="text-sm font-normal text-slate-400">/mo</span></div>
                                <p className="text-sm text-slate-400 mb-4 border-b border-slate-700 pb-4">For growing stores.</p>
                                <ul className="text-sm text-slate-300 space-y-2 mb-6 flex-1">
                                    <li className="flex items-center"><Check size={16} className="text-teal-500 mr-2" /> 1,200 Customers / mo</li>
                                </ul>

                                {planName === "Grow Premium $59" && !isLimitReached && !isExpired ? (
                                    <Button className="w-full bg-teal-900 text-teal-200 opacity-60 cursor-not-allowed border-none" disabled={true}>
                                        Current Plan
                                    </Button>
                                ) : (
                                    <Button 
                                        className="w-full bg-teal-600 hover:bg-teal-500 text-white" 
                                        disabled={updatingPlan !== null} 
                                        onClick={() => handleUpgradePlan("Grow Premium $59")}
                                    >
                                        {updatingPlan === "Grow Premium $59" ? "Processing..." : (planName === "Grow Premium $59" && (isLimitReached || isExpired) ? "Renew Premium" : "Upgrade to Premium")}
                                    </Button>
                                )}
                            </div>

                            {/* Grow Unlimited Package */}
                            <div className="border border-slate-700 bg-slate-800/50 rounded-lg p-5 flex flex-col hover:border-teal-500/50 transition-colors">
                                <h3 className="text-lg font-semibold text-white">Grow Unlimited</h3>
                                <div className="text-3xl font-bold text-white my-2">$100<span className="text-sm font-normal text-slate-400">/mo</span></div>
                                <p className="text-sm text-slate-400 mb-4 border-b border-slate-700 pb-4">Max power and scale.</p>
                                <ul className="text-sm text-slate-300 space-y-2 mb-6 flex-1">
                                    <li className="flex items-center"><Check size={16} className="text-teal-500 mr-2" /> 3,000 Customers / mo</li>
                                </ul>

                                {planName === "Grow Unlimited $100" && !isLimitReached && !isExpired ? (
                                    <Button className="w-full opacity-50 cursor-not-allowed" disabled={true}>
                                        Current Plan
                                    </Button>
                                ) : (
                                    <Button 
                                        className="w-full" 
                                        disabled={updatingPlan !== null} 
                                        onClick={() => handleUpgradePlan("Grow Unlimited $100")}
                                    >
                                        {updatingPlan === "Grow Unlimited $100" ? "Processing..." : (planName === "Grow Unlimited $100" && (isLimitReached || isExpired) ? "Renew Unlimited" : "Upgrade to Unlimited")}
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