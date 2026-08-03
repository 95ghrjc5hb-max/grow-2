import React, { useState, useEffect } from "react";
import { MessageCircle, Instagram, Phone, ShoppingBag, Wifi, WifiOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "../supabaseClient";
const platforms = [
  {
    key: "messenger",
    name: "Facebook Messenger",
    desc: "Connect your Facebook Page officially via Meta OAuth to sync and reply to Messenger DMs.",
    icon: MessageCircle,
    color: "blue",
    gradient: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/20",
    text: "text-blue-400",
    btn: "bg-blue-500 hover:bg-blue-600",
  },
  {
    key: "instagram",
    name: "Instagram Business",
    desc: "Connect your Instagram Business Profile via Meta secure login to manage DMs and story replies.",
    icon: Instagram,
    color: "pink",
    gradient: "from-pink-500/20 to-purple-500/5",
    border: "border-pink-500/20",
    text: "text-pink-400",
    btn: "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600",
  },
  {
    key: "whatsapp",
    name: "WhatsApp Business API",
    desc: "Connect your official WhatsApp Business API credentials to handle automated customer support.",
    icon: Phone,
    color: "green",
    gradient: "from-green-500/20 to-green-600/5",
    border: "border-green-500/20",
    text: "text-green-400",
    btn: "bg-green-500 hover:bg-green-600",
  },
   {
    key: "shopify",
    name: "Shopify Store",
    desc: "Connect your Shopify store to sync product catalog, stock status, and automate orders.",
    icon: ShoppingBag,
    color: "emerald",
    gradient: "from-emerald-500/20 to-teal-500/5",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    btn: "bg-emerald-600 hover:bg-emerald-700",
  },
];

export default function Integrations() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const { toast } = useToast();

  const [waCredentials, setWaCredentials] = useState({
    phoneNumber: "",
    phoneNumberId: "",
    businessAccountId: "",
    accessToken: ""
  });

  useEffect(() => {
    fetchActiveIntegrations();
  }, []);

    // Safe API Fetching Handler with User Auth Token
  const fetchActiveIntegrations = async () => {
    try {
      setLoading(true);

      // Get active user token from Supabase Auth
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/integrations", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      const result = await res.json();

      // Safely extract array regardless of backend response structure
      const channelList = Array.isArray(result)
        ? result
        : (result.data || result.integrations || []);

      setChannels(channelList);
    } catch (error) {
      console.error("Failed to load integrations", error);
      setChannels([]); // Default to empty array on error
    } finally {
      setLoading(false);
    }
  };

  // Safe array finder method
  const getChannel = (platform) => {
    if (!Array.isArray(channels)) return null;
    return channels.find((c) => c.platform === platform);
  };

  const handleMetaOAuth = (platformKey) => {
    const appId = import.meta.env.VITE_META_APP_ID || "YOUR_META_APP_ID";
    const redirectUri = `${window.location.origin}/api/auth/meta/callback`;
    const scope = "pages_show_list,pages_messaging,instagram_basic,instagram_manage_messages,pages_read_engagement";
    
    const oauthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${platformKey}`;
    
    window.open(oauthUrl, "Connect with Meta", "width=600,height=650,status=yes,resizable=yes");

    const handlePopupMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data?.status === "success") {
        toast({ title: `${platformKey === 'messenger' ? 'Facebook' : 'Instagram'} connected successfully!` });
        fetchActiveIntegrations();
        window.removeEventListener("message", handlePopupMessage);
      }
    };
    
    window.addEventListener("message", handlePopupMessage);
  };

  const handleDisconnect = async (platformKey) => {
    try {
      await fetch(`/api/integrations/${platformKey}`, { method: "DELETE" });
      toast({ title: `${platformKey} disconnected successfully.` });
      fetchActiveIntegrations();
    } catch (error) {
      toast({ title: "Failed to disconnect integration.", variant: "destructive" });
    }
  };

 const handleConnectClick = (platformKey) => {
  const existing = getChannel(platformKey);
  if (existing && existing.status === "connected") {
    handleDisconnect(platformKey);
    return;
  }

  if (platformKey === "whatsapp") {
    setShowWhatsAppModal(true);
  } else if (platformKey === "shopify") {
    setShowShopifyModal(true);
  } else {
    handleMetaOAuth(platformKey);
  }
};

// Handle WhatsApp Form Submission with Auth Header
const handleWhatsAppSubmit = async (e) => {
  e.preventDefault();
  try {
    // Retrieve session token for authenticated backend request
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch("/api/integrations/whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(waCredentials),
    });

    if (res.ok) {
      toast({ title: "WhatsApp Business API connected successfully!" });
      setShowWhatsAppModal(false);
      setWaCredentials({
        phoneNumber: "",
        phoneNumberId: "",
        businessAccountId: "",
        accessToken: ""
      });
      fetchActiveIntegrations();
    } else {
      throw new Error("Failed to connect WhatsApp");
    }
  } catch (error) {
    toast({
      title: "Failed to connect WhatsApp. Verify credentials.",
      variant: "destructive"
    });
  }
};
  
// Shopify Submit Handler
const handleShopifySubmit = (e) => {
  e.preventDefault();

  if (!shopifyDomain) return;

  // 1. Clean the domain input (remove http/https and trailing slashes)
  let cleanDomain = shopifyDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '') // Remove http:// or https://
    .replace(/\/.*$/, '');       // Remove slashes at the end

  // 2. Automatically append .myshopify.com if missing
  if (!cleanDomain.includes('.')) {
    cleanDomain += '.myshopify.com';
  }

  // 3. Redirect browser to backend Shopify OAuth endpoint
  window.location.href = `/api/auth/shopify?shop=${cleanDomain}`;
};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="text-slate-400 mt-1">Connect your verified business channels to handle production omnichannel communications.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {platforms.map((p) => {
          const channel = getChannel(p.key);
          const connected = channel?.status === "connected";
          const Icon = p.icon;

          return (
            <div key={p.key} className={`rounded-xl border bg-gradient-to-br p-6 transition-all hover:scale-[1.01] ${p.gradient} ${p.border}`}>
              <div className="flex items-start justify-between mb-5">
                <div className={`p-3 rounded-xl bg-white/5`}>
                  <Icon className={`w-7 h-7 ${p.text}`} />
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${connected ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                  {connected ? (
                    <>
                      <Wifi className="w-3 h-3" /> Connected
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3" /> Disconnected
                    </>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-white mb-2">{p.name}</h3>
              <p className="text-sm text-slate-400 mb-6 min-h-[40px]">{p.desc}</p>

              {connected && channel?.account_name && (
                <p className="text-xs text-slate-500 mb-4">
                  Account: <span className={p.text}>{channel.account_name}</span>
                </p>
              )}

              <Button onClick={() => handleConnectClick(p.key)} className={`w-full gap-2 text-white ${connected ? "bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 text-red-400" : p.btn}`}>
                {connected ? (
                  "Disconnect Channel"
                ) : (
                  <>
                    <><ExternalLink className="w-4 h-4" /> Connect {p.name}</>
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Connect WhatsApp Business Cloud API</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWhatsAppSubmit} className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Display Phone Number</label>
              <Input required value={waCredentials.phoneNumber} onChange={(e) => setWaCredentials({...waCredentials, phoneNumber: e.target.value})} placeholder="+8801XXXXXXXXX" className="bg-slate-950 border-slate-800" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Phone Number ID</label>
              <Input required value={waCredentials.phoneNumberId} onChange={(e) => setWaCredentials({...waCredentials, phoneNumberId: e.target.value})} placeholder="Ex: 1092837465623" className="bg-slate-950 border-slate-800" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">WhatsApp Business Account ID</label>
              <Input required value={waCredentials.businessAccountId} onChange={(e) => setWaCredentials({...waCredentials, businessAccountId: e.target.value})} placeholder="Ex: 9876543210123" className="bg-slate-950 border-slate-800" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Permanent Access Token</label>
              <Input required value={waCredentials.accessToken} onChange={(e) => setWaCredentials({...waCredentials, accessToken: e.target.value})} type="password" placeholder="EAABw..." className="bg-slate-950 border-slate-800" />
            </div>
            <Button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white font-medium">Save & Initialize Webhook</Button>
          </form>
        </DialogContent>
      </Dialog>
      {/* SHOPIFY STORE MODAL */}
<Dialog open={showShopifyModal} onOpenChange={setShowShopifyModal}>
  <DialogContent className="bg-slate-900 border border-slate-800 text-white max-w-md">
    <DialogHeader>
      <DialogTitle>Connect Shopify Store</DialogTitle>
    </DialogHeader>
    <form onSubmit={handleShopifySubmit} className="space-y-4 mt-2">
      <div>
        <label className="text-xs text-slate-400 block mb-1">Shopify Store Domain</label>
        <Input 
          required 
          value={shopifyDomain} 
          onChange={(e) => setShopifyDomain(e.target.value)} 
          placeholder="your-store.myshopify.com" 
          className="bg-slate-950 border-slate-800 text-white" 
        />
      </div>
      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
        Connect Shopify Store
      </Button>
    </form>
  </DialogContent>
</Dialog>

    </div>
  );
}
