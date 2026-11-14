import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, Instagram, Phone, Send, Pause, Play, User, Tag, Search, RefreshCw, ShoppingBag, ArrowLeft, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChannelIcon from "@/components/shared/ChannelIcon";
import api from "../api/GrowClient";
import { supabase } from "../supabaseClient";

const channelFilters = [
  { key: "all", label: "All", icon: null },
  { key: "shopify", label: "Shopify", icon: ShoppingBag, color: "text-teal-400" },
  { key: "messenger", label: "Messenger", icon: MessageCircle, color: "text-blue-400" },
  { key: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-400" },
  { key: "whatsapp", label: "WhatsApp", icon: Phone, color: "text-green-400" },
];

// Dynamic API URL for production and local environment
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
export default function UnifiedInbox() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [filter, setFilter] = useState("all");
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [storeAiActive, setStoreAiActive] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  

  const getAuthHeaders = () => {
    // ১. সব জায়গা থেকে টোকেন খোঁজার চেষ্টা
    let token = localStorage.getItem("token") || localStorage.getItem("grow_access_token") || "";

    if (!token) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes("-auth-token")) {
          try {
            const sessionData = JSON.parse(localStorage.getItem(key));
            token = sessionData?.access_token || sessionData?.currentSession?.access_token || "";
            break;
          } catch (e) { }
        }
      }
    }

    // ২. সমস্যা ধরার ফাঁদ (Alert)
    if (!token) {
      alert("🚨 Error: আপনার টোকেন একদম খালি! ব্রাউজার টোকেন সেভ করতে পারছে না।");
    }

    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    };
  };
  // সঠিক URL-এ fetch কল
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/conversations`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to fetch conversations");

     const data = await res.json();
      if (typeof data.store_ai_active === "boolean") {
        setStoreAiActive(data.store_ai_active);
      }
      const convArray = Array.isArray(data.data) ? data.data : data || [];
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

 // Realtime subscription for incoming/outgoing messages
  useEffect(() => {
    const channel = supabase
      .channel("realtime-messages-inbox")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new;

         // 1. Update currently selected active chat
        setSelectedConv((prevSelected) => {
            if (!prevSelected) return prevSelected;
            const targetId = prevSelected.id || prevSelected._id;
            
            if (newMsg.conversation_id === targetId) {
                const currentMessages = prevSelected.messages || [];
                
                // Step A: If the real message already exists, do nothing
                if (currentMessages.some(m => m.id === newMsg.id)) return prevSelected;
                
                // Step B: Find the optimistic (fake) message and replace it with the real one
                let isReplaced = false;
                const mergedMessages = currentMessages.map(m => {
                    // Match by sender and content, and ensure the old message has no ID yet
                    if (!isReplaced && !m.id && m.sender === newMsg.sender && (m.content === newMsg.content || m.text === newMsg.content)) {
                        isReplaced = true;
                        return newMsg; 
                    }
                    return m;
                });

                // Step C: If it wasn't a replacement (e.g., new customer message), push to the array
                if (!isReplaced) {
                    mergedMessages.push(newMsg);
                }

                return {
                    ...prevSelected,
                    messages: mergedMessages,
                    last_message: newMsg.content || newMsg.text,
                    updated_at: newMsg.created_at,
                };
            }
            return prevSelected;
        });

        // 2. Update sidebar conversations list live
        setConversations((prevConvs) =>
            prevConvs.map((conv) => {
                const convId = conv.id || conv._id;
                if (convId === newMsg.conversation_id) {
                    const currentMessages = conv.messages || [];
                    
                    if (currentMessages.some(m => m.id === newMsg.id)) return conv;
                    
                    let isReplaced = false;
                    const mergedMessages = currentMessages.map(m => {
                        if (!isReplaced && !m.id && m.sender === newMsg.sender && (m.content === newMsg.content || m.text === newMsg.content)) {
                            isReplaced = true;
                            return newMsg;
                        }
                        return m;
                    });

                    if (!isReplaced) {
                        mergedMessages.push(newMsg);
                    }
                    
                    return {
                        ...conv,
                        messages: mergedMessages,
                        last_message: newMsg.content || newMsg.text,
                        updated_at: newMsg.created_at,
                    };
                }
                return conv;
            })
        );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  // Rule 1: Strict Image File Validation (JPG, PNG, WEBP only, max 5MB)
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      alert("Invalid file type! Only JPG, PNG, and WEBP images are allowed.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large! Maximum allowed size is 5MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage({
        base64: reader.result,
        mimeType: file.type.toLowerCase(),
        previewUrl: reader.result,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Outbound Send Handler (Text / Image / Image + Caption) with Optimistic UI & Rollback
  const handleSend = async () => {
    const trimmedText = newMessage.trim();
    if ((!trimmedText && !selectedImage) || !selectedConv || sending) return;

    if (trimmedText.length > 1024) {
      alert("Caption/message cannot exceed 1024 characters (WhatsApp limit).");
      return;
    }

    const currentText = trimmedText;
    const currentImage = selectedImage;

    setNewMessage("");
    setSelectedImage(null);
    setSending(true);

    const targetId = selectedConv.id || selectedConv._id;
    const previousConversations = [...conversations];
    const previousSelectedConv = { ...selectedConv };

    const displayContent = currentText || "[Image]";
    const sidebarLastMsg =
      currentImage && currentText
        ? `📷 ${currentText}`
        : currentImage
          ? "📷 [Image]"
          : currentText;

    const updatedMessages = [
      ...(selectedConv.messages || []),
      {
        sender: "agent",
        content: displayContent,
        image_url: currentImage ? currentImage.previewUrl : null,
        created_at: new Date().toISOString(),
      },
    ];

    const updatedConv = {
      ...selectedConv,
      messages: updatedMessages,
      last_message: sidebarLastMsg,
    };

    // Immediate Optimistic UI Update
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
          customerPhone: selectedConv.customer_identifier,
          messageText: currentText,
          platform: selectedConv.channel,
          imageBase64: currentImage ? currentImage.base64 : null,
          imageMimeType: currentImage ? currentImage.mimeType : null,
        }),
      });

      const responseData = await res.json();

      if (!res.ok) {
        console.error("Backend Auth/Send Error:", responseData);
        throw new Error(responseData.error || "Failed to send message");
      }

      // Sync saved message (with permanent Supabase image_url) into state if Realtime hasn't arrived yet
      if (responseData.data?.id) {
        const savedMsg = responseData.data;
        setSelectedConv((prev) => {
          if (!prev || (prev.id || prev._id) !== targetId) return prev;
          const msgs = prev.messages || [];
          if (msgs.some((m) => m.id === savedMsg.id)) return prev;
          let replaced = false;
          const nextMsgs = msgs.map((m) => {
            if (!replaced && !m.id && m.sender === "agent") {
              replaced = true;
              return savedMsg;
            }
            return m;
          });
          return { ...prev, messages: nextMsgs };
        });
      }
    } catch (err) {
      console.error("Message send error:", err);
      // Rollback UI on failure (no duplicate saved)
      setSelectedConv(previousSelectedConv);
      setConversations(previousConversations);
      setNewMessage(currentText);
      setSelectedImage(currentImage);
      alert(err.message || "Failed to send message. Please try again.");
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

    // Toggle Overall Store AI state (bot_configs.is_active)
    const toggleStoreAI = async () => {
      const nextStoreState = !storeAiActive;
      const prevStoreState = storeAiActive;

      setStoreAiActive(nextStoreState);

      try {
        const res = await fetch(`${API_BASE_URL}/conversations/store-pause`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ is_active: nextStoreState }),
        });

        if (!res.ok) throw new Error("Store AI state update failed");
      } catch (err) {
        console.error("Store AI state sync failure:", err);
        setStoreAiActive(prevStoreState);
        alert("Could not update Store AI state. Rolling back.");
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
        <div className={`w-full md:w-80 border-r border-white/10 flex flex-col bg-[hsl(220,18%,9%)] shrink-0 ${selectedConv ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-white/10">
           <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-lg font-semibold text-white">Inbox</h2>
              <div className="flex items-center gap-1.5">
                <Button
                  onClick={toggleStoreAI}
                  size="sm"
                  variant="outline"
                  className={`h-7 px-2.5 text-xs font-medium gap-1.5 border transition-all ${
                    storeAiActive
                      ? "border-teal-500/30 bg-teal-500/10 text-teal-400 hover:bg-amber-500/15 hover:text-amber-300 hover:border-amber-500/30"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-teal-500/15 hover:text-teal-300 hover:border-teal-500/30"
                  }`}
                  title={storeAiActive ? "Click to pause AI for entire store" : "Click to resume AI for entire store"}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${storeAiActive ? "bg-teal-400 animate-pulse" : "bg-rose-400"}`} />
                  {storeAiActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{storeAiActive ? "Store AI: ON" : "Store Paused"}</span>
                </Button>

                <Button
                  onClick={fetchConversations}
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/5 shrink-0"
                  title="Refresh conversations"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 bg-white/5 border-white/10 text-white focus-visible:ring-teal-500 text-base md:text-sm"
            />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {channelFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === f.key
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
                    className={`w-full text-left p-4 border-b border-white/5 transition-all ${isSelected ? "bg-teal-500/10 border-l-2 border-l-teal-500" : "hover:bg-white/[0.03]"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <ChannelIcon channel={conv.channel} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-white truncate">{conv.customer_name}</p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${conv.ai_active
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
      <div className={`flex-1 flex flex-col bg-[hsl(220,18%,7%)] overflow-hidden ${selectedConv ? "fixed inset-0 z-50 h-[100dvh] w-full flex md:static md:h-full md:z-auto" : "hidden md:flex md:h-full"}`}>
       {selectedConv ? (
            <>
             {/* Pinned Chat Header with Pause Button */}
        <div className="p-3 md:p-4 border-b border-white/10 flex items-center justify-between bg-[hsl(220,18%,8%)] shrink-0 sticky top-0 z-10 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setSelectedConv(null)}
              className="md:hidden -ml-1 p-1 text-slate-400 hover:text-white shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <ChannelIcon channel={selectedConv.channel} size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white text-sm md:text-base truncate">{selectedConv.customer_name}</p>
              <p className="text-xs text-slate-400 truncate">via {selectedConv.channel}</p>
            </div>
          </div>

         <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-xs px-2 py-0.5 md:px-2.5 md:py-1 rounded-full font-medium ${
                !storeAiActive
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  : selectedConv.ai_active
                    ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              {!storeAiActive ? "Store Paused" : selectedConv.ai_active ? "AI Active" : "Human"}
            </span>

            <Button
              onClick={toggleAI}
              disabled={!storeAiActive}
              size="sm"
              variant="outline"
              className={`h-7 px-2 text-xs gap-1 border shrink-0 ${
                !storeAiActive
                  ? "border-white/10 text-slate-500 opacity-50 cursor-not-allowed"
                  : selectedConv.ai_active
                    ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                    : "border-teal-500/30 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300"
              }`}
            >
              {!storeAiActive ? (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Store Paused</span>
                </>
              ) : (
                <>
                  {selectedConv.ai_active ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{selectedConv.ai_active ? "Pause" : "Resume"}</span>
                </>
              )}
            </Button>
          </div>
        </div>

             <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {!selectedConv.messages || selectedConv.messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-12">No messages yet</p>
                ) : (
                  selectedConv.messages.map((msg, i) => {
                    const textBody = msg.message || msg.text || msg.content || msg.message_body || "";
                    const showText = textBody && !(msg.image_url && textBody.trim() === "[Image]");

                    return (
                      <div key={msg.id || i} className={`flex ${msg.sender === "customer" ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[78%] md:max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm ${
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

                          {msg.image_url && (
                            <div className="mb-1.5 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                              <img
                                src={msg.image_url}
                                alt="Chat attachment"
                                onClick={() => setLightboxImage(msg.image_url)}
                                className="max-h-64 w-auto max-w-full object-cover rounded-xl cursor-zoom-in hover:opacity-95 transition-opacity"
                                loading="lazy"
                              />
                            </div>
                          )}

                          {showText && (
                            <p className="whitespace-pre-wrap break-words">{textBody}</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-3 pb-6 md:pb-4 border-t border-white/10 bg-[hsl(220,18%,8%)] shrink-0">
                <div className="flex items-center gap-2">
                  {/* Hidden File Input (JPG, PNG, WEBP only) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                  />

                  {/* Left-side Image Upload Button */}
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    variant="outline"
                    size="icon"
                    className="bg-white/5 border-white/10 text-slate-300 hover:text-teal-400 hover:border-teal-500/40 hover:bg-teal-500/10 shrink-0"
                    title="Attach image (JPG, PNG, WEBP up to 5MB)"
                  >
                    <ImagePlus className="w-4 h-4" />
                  </Button>

                  {/* Inline Compact Image Thumbnail Chip (same row, left of input) */}
                  {selectedImage && (
                    <div className="relative shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-teal-500/40 bg-black/40 group">
                      <img
                        src={selectedImage.previewUrl}
                        alt="Selected preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedImage(null)}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 md:opacity-0 opacity-90 transition-opacity text-white"
                        title="Remove image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    maxLength={1024}
                    placeholder={selectedImage ? "Add a caption (optional)..." : "Type a reply..."}
                    disabled={sending}
                    style={{ fontSize: "20px" }}
                    className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500 text-base flex-1"
                  />

                  <Button
                    onClick={handleSend}
                    disabled={sending || (!newMessage.trim() && !selectedImage)}
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
        <div className="hidden xl:block w-72 border-l border-white/10 bg-[hsl(220,18%,9%)] p-6 shrink-0 overflow-y-auto">
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
                  <span className="text-xs text-slate-400">Chat AI Status</span>
                  <span
                    className={`text-xs font-medium ${
                      !storeAiActive
                        ? "text-rose-400"
                        : selectedConv.ai_active
                          ? "text-teal-400"
                          : "text-amber-400"
                    }`}
                  >
                    {!storeAiActive ? "Store Paused" : selectedConv.ai_active ? "Active" : "Paused (Human)"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-500">Select a conversation</p>
            </div>
          )}
        </div>

        {/* Fullscreen Image Lightbox Modal */}
        {lightboxImage && (
          <div
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              title="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImage}
              alt="Full size preview"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[92vw] object-contain rounded-xl shadow-2xl border border-white/10"
            />
          </div>
        )}
      </div>
    );
  }
