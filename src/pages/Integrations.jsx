import React, { useState, useEffect } from "react";
import { MessageCircle, Instagram, Phone, ShoppingBag, Wifi, WifiOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

const platforms = [
  {
    key: "messenger",
    name: "Facebook Messenger",
    desc: "Connect your Facebook Page officially via Meta OAuth to sync and reply to Messenger DMs.",
    icon: MessageCircle,
    color: "blue",
    gradient: "from-slate-900 to-slate-900/90",
    border: "border-slate-800",
    text: "text-blue-400",
    btn: "bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm",
  },
  {
    key: "instagram",
    name: "Instagram Business",
    desc: "Connect your Instagram Business Profile via Meta secure login to manage DMs and story replies.",
    icon: Instagram,
    color: "pink",
    gradient: "from-slate-900 to-slate-900/90",
    border: "border-slate-800",
    text: "text-pink-400",
    btn: "bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm",
  },
  {
    key: "whatsapp",
    name: "WhatsApp Business API",
    desc: "Connect your official WhatsApp Business API credentials to handle automated customer support.",
    icon: Phone,
    color: "green",
    gradient: "from-slate-900 to-slate-900/90",
    border: "border-slate-800",
    text: "text-green-400",
    btn: "bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm",
  },
   {
    key: "shopify",
    name: "Shopify Store",
    desc: "Connect your Shopify store to sync product catalog, stock status, and automate orders.",
    icon: ShoppingBag,
    color: "emerald",
    gradient: "from-slate-900 to-slate-900/90",
    border: "border-slate-800",
    text: "text-emerald-400",
    btn: "bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm",
  }
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

  // 🛡️ ARCHITECTURE: Defensive Supabase Token Extractor
  const getTokenAndOrgId = () => {
    let token = "";
    let myOrgId = null;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const sessionData = JSON.parse(localStorage.getItem(key));
          token = sessionData.access_token || "";
          myOrgId = sessionData.user?.id || null;
          break; 
        }
      }
    } catch (e) {
      console.error("[SECURITY ERROR]: Failed to parse session data", e);
    }
    return { token, myOrgId };
  };

  useEffect(() => {
    fetchActiveIntegrations();
  }, []);

  // 🔄 LOGIC: Fetch integrations with strict Auth verification
  const fetchActiveIntegrations = async () => {
    try {
      setLoading(true);
      const { token } = getTokenAndOrgId();

      if (!token) {
        setChannels([]);
        return;
      }

      const res = await fetch("/api/integrations", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!res.ok) throw new Error("API response was not ok");
      const result = await res.json();

      const channelList = Array.isArray(result) ? result : (result.data || result.integrations || []);
      setChannels(channelList);
    } catch (error) {
      console.error("[FETCH ERROR]:", error);
      setChannels([]); 
    } finally {
      setLoading(false);
    }
  };

  const getChannel = (platform) => {
    if (!Array.isArray(channels)) return null;
    return channels.find((c) => c.platform === platform);
  };

  // 🔗 LOGIC: Secure Meta OAuth Flow with Dynamic Scopes
  const handleMetaOAuth = (platformKey) => {
    const { token } = getTokenAndOrgId();
    if (!token) {
      toast({ title: "Authentication error", description: "Please log in again.", variant: "destructive" });
      return;
    }

    const appId = import.meta.env.VITE_META_APP_ID || "YOUR_META_APP_ID";
    const redirectUri = `${window.location.origin}/api/auth/meta/callback`;
    
    // 🔥 DYNAMIC SCOPE LOGIC (আপনার বলা লজিক অনুযায়ী)
    let scope = "";
    if (platformKey === "messenger") {
      scope = "pages_show_list,pages_messaging"; 
    } else if (platformKey === "instagram") {
      scope = "pages_show_list,instagram_basic,instagram_manage_messages,pages_read_engagement";
    }
    
    const customState = encodeURIComponent(`${platformKey}___${token}`);
  const oauthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${customState}&config_id=1389130196651056&response_type=code`;
    
    const popup = window.open(oauthUrl, "Connect with Meta", "width=600,height=650,status=yes,resizable=yes");

    const handlePopupMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data?.status === "success") {
        toast({ title: `${platformKey === 'messenger' ? 'Facebook' : 'Instagram'} connected successfully!` });
        fetchActiveIntegrations();
        window.removeEventListener("message", handlePopupMessage);
      }
    };
    
    window.addEventListener("message", handlePopupMessage);

    const timer = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(timer);
        window.removeEventListener("message", handlePopupMessage);
      }
    }, 1000);
  };

  const handleDisconnect = async (platformKey) => {
    try {
      const { token } = getTokenAndOrgId();
      const res = await fetch(`/api/integrations/${platformKey}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to disconnect");
      
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

    if (platformKey === "whatsapp") setShowWhatsAppModal(true);
    else if (platformKey === "shopify") setShowShopifyModal(true);
    else handleMetaOAuth(platformKey);
  };

  // 📱 LOGIC: WhatsApp Manual Credential Submission
  const handleWhatsAppSubmit = async (e) => {
    e.preventDefault();
    try {
      const { token } = getTokenAndOrgId();

      const res = await fetch("/api/integrations/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(waCredentials),
      });

      if (!res.ok) throw new Error("Failed to connect WhatsApp");

      toast({ title: "WhatsApp Business API connected successfully!" });
      setShowWhatsAppModal(false);
      setWaCredentials({ phoneNumber: "", phoneNumberId: "", businessAccountId: "", accessToken: "" });
      fetchActiveIntegrations();
    } catch (error) {
      toast({ title: "Failed to connect WhatsApp. Verify credentials.", variant: "destructive" });
    }
  };
    
  // 🛍️ LOGIC: Secure Shopify OAuth Redirect
  const handleShopifySubmit = (e) => {
    e.preventDefault();
    if (!shopifyDomain) return;

    let cleanDomain = shopifyDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');       
    if (!cleanDomain.includes('.')) cleanDomain += '.myshopify.com';

    const { token } = getTokenAndOrgId();
    if (!token) {
      toast({ title: "Authentication error", variant: "destructive" });
      return;
    }

    window.location.href = `/api/auth/shopify?shop=${cleanDomain}&token=${encodeURIComponent(token)}`;
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
                  {connected ? <><Wifi className="w-3 h-3" /> Connected</> : <><WifiOff className="w-3 h-3" /> Disconnected</>}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-white mb-2">{p.name}</h3>
              <p className="text-sm text-slate-400 mb-6 min-h-[40px]">{p.desc}</p>

              {connected && channel?.account_name && (
                <p className="text-xs text-slate-500 mb-4">
                  Account: <span className={p.text}>{channel.account_name}</span>
                </p>
              )}
              <Button 
                onClick={() => handleConnectClick(p.key)} 
                className={`w-full gap-2 transition-all duration-150 rounded-lg py-2.5 font-medium ${connected ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700" : p.btn}`}
              >
                {connected ? "Manage Integration" : <><ExternalLink className="w-4 h-4" /> Connect</>}
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-white max-w-md">
          <DialogHeader><DialogTitle>Connect WhatsApp Business Cloud API</DialogTitle></DialogHeader>
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

      <Dialog open={showShopifyModal} onOpenChange={setShowShopifyModal}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-white max-w-md">
          <DialogHeader><DialogTitle>Connect Shopify Store</DialogTitle></DialogHeader>
          <form onSubmit={handleShopifySubmit} className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Shopify Store Domain</label>
              <Input required value={shopifyDomain} onChange={(e) => setShopifyDomain(e.target.value)} placeholder="your-store.myshopify.com" className="bg-slate-950 border-slate-800 text-white" />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium">Connect Shopify Store</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}