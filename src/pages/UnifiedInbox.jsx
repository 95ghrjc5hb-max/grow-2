import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, Instagram, Phone, Send, Pause, Play, User, Tag, Search, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChannelIcon from "@/components/shared/ChannelIcon";

const channelFilters = [
  { key: "all", label: "All", icon: null },
  { key: "shopify", label: "Shopify", icon: ShoppingBag, color: "text-teal-400" },
  { key: "messenger", label: "Messenger", icon: MessageCircle, color: "text-blue-400" },
  { key: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-400" },
  { key: "whatsapp", label: "WhatsApp", icon: Phone, color: "text-green-400" },
];

// Dynamic API URL for production and local environment
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function UnifiedInbox() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [filter, setFilter] = useState("all");
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  // Helper function to attach Auth JWT Token
  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  };

  // Fetch conversations securely from Backend
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/conversations`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch conversations");

      const data = await res.json();
      const convArray = Array.isArray(data) ? data : data.data || [];
      setConversations(convArray);

      if (convArray.length > 0 && !selectedConv) {
        setSelectedConv(convArray[0]);
      }
    } catch (err) {
      console.error("Backend communication failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConv?.messages]);

  const filtered = conversations.filter((c) => {
    const matchFilter = filter === "all" || c.channel === filter;
    const matchSearch = !search || c.customer_name?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  // Outbound Send Handler with Optimistic UI & Rollback
  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConv || sending) return;

    const currentText = newMessage;
    setNewMessage("");
    setSending(true);

    const targetId = selectedConv.id || selectedConv._id;

    const messagePayload = {
      sender: "agent",
      text: currentText,
      time: new Date().toISOString(),
    };

    const previousConversations = [...conversations];
    const previousSelectedConv = { ...selectedConv };

    const updatedMessages = [...(selectedConv.messages || []), messagePayload];
    const updatedConv = {
      ...selectedConv,
      messages: updatedMessages,
      last_message: currentText,
    };

    // Immediate UI Update
    setSelectedConv(updatedConv);
    setConversations((prev) =>
      prev.map((c) => ((c.id || c._id) === targetId ? updatedConv : c))
    );

    try {
      const res = await fetch(`${API_BASE_URL}/message/send`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          conversationId: targetId,
          customerPhone: selectedConv.customer_social_id,
          messageText: currentText,
          platform: selectedConv.channel,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");
    } catch (err) {
      console.error("Failed to route outbound message:", err);
      // Rollback UI on failure
      setSelectedConv(previousSelectedConv);
      setConversations(previousConversations);
      setNewMessage(currentText);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Toggle AI Active state with Optimistic UI & Rollback
  const toggleAI = async () => {
    if (!selectedConv) return;

    const targetId = selectedConv.id || selectedConv._id;
    const nextAIState = !selectedConv.ai_active;

    const previousConversations = [...conversations];
    const previousSelectedConv = { ...selectedConv };

    const updated = { ...selectedConv, ai_active: nextAIState };

    // Immediate UI Update
    setSelectedConv(updated);
    setConversations((prev) =>
      prev.map((c) => ((c.id || c._id) === targetId ? updated : c))
    );

    try {
      const res = await fetch(`${API_BASE_URL}/conversations/${targetId}/ai-toggle`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ai_active: nextAIState }),
      });

      if (!res.ok) throw new Error("AI state update failed");
    } catch (err) {
      console.error("AI automation state sync failure:", err);
      // Rollback UI on failure
      setSelectedConv(previousSelectedConv);
      setConversations(previousConversations);
      alert("Could not update AI state. Rolling back.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[hsl(220,18%,9%)]">
        <div className="w-8 h-8 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex text-slate-200">
      {/* Left Column: Conversation List */}
      <div className="w-80 border-r border-white/10 flex flex-col bg-[hsl(220,18%,9%)]">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Inbox</h2>
            <Button
              onClick={fetchConversations}
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/5"
              title="Refresh conversations"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 bg-white/5 border-white/10 text-sm focus-visible:ring-teal-500"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {channelFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  filter === f.key
                    ? "bg-teal-500/15 text-teal-400 border border-teal-500/25"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                {f.icon && <f.icon className="w-3 h-3" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-12">No conversations found</p>
          ) : (
            filtered.map((conv) => {
              const convId = conv.id || conv._id;
              const isSelected = (selectedConv?.id || selectedConv?._id) === convId;

              return (
                <button
                  key={convId}
                  onClick={() => setSelectedConv(conv)}
                  className={`w-full text-left p-4 border-b border-white/5 transition-all ${
                    isSelected ? "bg-teal-500/10 border-l-2 border-l-teal-500" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ChannelIcon channel={conv.channel} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white truncate">{conv.customer_name}</p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            conv.ai_active
                              ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {conv.ai_active ? "AI" : "Human"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {conv.last_message || "Start a conversation"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Middle Column: Chat Window */}
      <div className="flex-1 flex flex-col bg-[hsl(220,18%,7%)]">
        {selectedConv ? (
          <>
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[hsl(220,18%,9%)]">
              <div className="flex items-center gap-3">
                <ChannelIcon channel={selectedConv.channel} size="md" />
                <div>
                  <p className="font-semibold text-white">{selectedConv.customer_name}</p>
                  <p className="text-xs text-slate-400">via {selectedConv.channel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    selectedConv.ai_active
                      ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {selectedConv.ai_active ? "AI Active" : "Human Mode"}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {!selectedConv.messages || selectedConv.messages.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-12">No messages yet</p>
              ) : (
                selectedConv.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === "customer" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm ${
                        msg.sender === "customer"
                          ? "bg-white/[0.08] text-slate-200 rounded-bl-none"
                          : msg.sender === "bot"
                          ? "bg-teal-500/15 text-teal-100 rounded-br-none border border-teal-500/20"
                          : "bg-blue-500/15 text-blue-100 rounded-br-none border border-blue-500/20"
                      }`}
                    >
                      <p className="text-[10px] font-semibold mb-1 opacity-60 uppercase tracking-wider">
                        {msg.sender === "customer"
                          ? selectedConv.customer_name
                          : msg.sender === "bot"
                          ? "GrowBot AI"
                          : "Agent"}
                      </p>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-white/10 bg-[hsl(220,18%,9%)]">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a reply..."
                  disabled={sending}
                  className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500"
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  size="icon"
                  className="bg-teal-500 hover:bg-teal-600 text-black shrink-0 font-medium"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">Select a conversation to start</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Customer Profile */}
      <div className="w-72 border-l border-white/10 bg-[hsl(220,18%,9%)] p-6">
        {selectedConv ? (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30 flex items-center justify-center mx-auto mb-3">
                <User className="w-7 h-7 text-teal-400" />
              </div>
              <h3 className="font-semibold text-white">{selectedConv.customer_name}</h3>
              <p className="text-xs text-slate-400 mt-1">{selectedConv.customer_social_id || "N/A"}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-xs text-slate-400">Channel</span>
                <ChannelIcon channel={selectedConv.channel} showLabel />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-xs text-slate-400">Tag</span>
                <span className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {selectedConv.tag || "lead"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-xs text-slate-400">AI Bot</span>
                <span
                  className={`text-xs font-medium ${
                    selectedConv.ai_active ? "text-teal-400" : "text-amber-400"
                  }`}
                >
                  {selectedConv.ai_active ? "Active" : "Paused"}
                </span>
              </div>
            </div>

            <Button
              onClick={toggleAI}
              variant="outline"
              className={`w-full gap-2 ${
                selectedConv.ai_active
                  ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  : "border-teal-500/30 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300"
              }`}
            >
              {selectedConv.ai_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {selectedConv.ai_active ? "Pause AI Bot" : "Resume AI Bot"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-500">Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
