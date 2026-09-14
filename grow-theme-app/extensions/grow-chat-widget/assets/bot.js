// ১. আপনার আসল Supabase URL ও Anon Key
const SUPABASE_URL = "https://osauxwxxkimjaadppqrq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KEKFu4tlt1GA9a-d71MczQ_t4_H8_1n";

let realtimeChannel = null;

// ২. ডিবাগ ট্র্যাকারসহ লাইভ লিসেনার ফাংশন
function subscribeToAgentLiveChat(convId) {
  console.log("🔥 subscribeToAgentLiveChat called with ID:", convId);
  
  const sb = window.supabase;
  if (!sb) {
    console.error("❌ window.supabase is missing. Script not loaded!");
    return;
  }
  
  if (realtimeChannel) {
    console.log("⚠️ Already subscribed to channel.");
    return;
  }

  // এখানে আপনার URL ও Key ব্যবহার করে ডাটাবেসে কানেক্ট হচ্ছে
  const supabaseClient = sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase Client Initialized for Realtime");

  realtimeChannel = supabaseClient
    .channel(`storefront_${convId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${convId}`
      },
      (payload) => {
        console.log("🚀 REALTIME PAYLOAD RECEIVED:", payload);
        const newMsg = payload.new;
        
        if (newMsg && newMsg.sender === 'agent') {
          const chatBody = document.getElementById("grow-ai-body");
          if (chatBody) {
            const agentDiv = document.createElement("div");
            agentDiv.className = "grow-ai-message grow-ai-bot-message";
            agentDiv.textContent = newMsg.content;
            chatBody.appendChild(agentDiv);
            chatBody.scrollTop = chatBody.scrollHeight;
            console.log("✅ Agent message rendered on screen!");
          } else {
            console.error("❌ DOM Error: 'grow-ai-body' not found.");
          }
        }
      }
    )
    .subscribe((status, err) => {
      console.log('📡 Realtime Connection Status:', status);
      if (err) console.error("❌ Realtime Subscription Error:", err);
    });
}

(function () {
  console.log("Grow AI Chat Widget Loaded (Enterprise Multi-Tenant Mode)");

  // 1. YOUR LIVE BACKEND URL
  const BACKEND_URL = "https://unloving-unnamed-flight.ngrok-free.dev";

  // State variables for attachments
  let currentImageBase64 = null;
  let currentAudioBase64 = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

  // 2. Inject Styles
  const style = document.createElement("style");
  style.innerHTML = `
    .grow-ai-bubble { position: fixed; bottom: 30px; right: 30px; width: 60px; height: 60px; background-color: #10b981; border-radius: 50%; box-shadow: 0 4px 16px rgba(0,0,0,0.2); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2147483647; transition: transform 0.2s ease-in-out; }
    .grow-ai-bubble:hover { transform: scale(1.05); }
    .grow-ai-bubble svg { width: 28px; height: 28px; fill: white; }
    .grow-ai-window { position: fixed; bottom: 105px; right: 30px; width: 380px; height: 550px; background: white; border-radius: 16px; box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1); z-index: 2147483647; display: none; flex-direction: column; overflow: hidden; border: 1px solid #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .grow-ai-header { background: #000000; color: white; padding: 16px; font-size: 16px; display: flex; justify-content: space-between; align-items: center; }
    .grow-ai-close { cursor: pointer; font-size: 20px; }
    .grow-ai-body { flex: 1; padding: 16px; background: #f9fafb; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    .grow-ai-message { background: white; padding: 10px 14px; border-radius: 14px; border: 1px solid #e5e7eb; font-size: 14px; max-width: 80%; color: #1f2937; word-break: break-word; }
    .grow-ai-user-message { background: #000000; color: white; border-radius: 14px; padding: 10px 14px; font-size: 14px; max-width: 80%; align-self: flex-end; word-break: break-word; }
    .grow-ai-bot-message { align-self: flex-start; }
    .grow-ai-footer-container { display: flex; flex-direction: column; border-top: 1px solid #e5e7eb; background: white; }
    .grow-preview-area { padding: 4px 12px; display: none; align-items: center; gap: 10px; background: #f3f4f6; font-size: 12px; color: #4b5563; }
    .grow-preview-area img { max-height: 40px; border-radius: 4px; }
    .grow-preview-area .remove-btn { cursor: pointer; color: red; font-weight: bold; margin-left: auto; }
    .grow-ai-footer { padding: 10px 12px; display: flex; align-items: center; gap: 8px; }
    .grow-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #6b7280; transition: background 0.2s; }
    .grow-icon-btn:hover { background: #f3f4f6; color: #000000; }
    .grow-icon-btn.recording { color: red; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
    .grow-ai-input { flex: 1; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 20px; outline: none; font-size: 14px; }
    .grow-ai-input:focus { border-color: #000000; }
    .grow-send-btn { background: #000000; color: white; border: none; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  `;
  document.head.appendChild(style);

  // 3. Create UI Elements
  const bubble = document.createElement("div");
  bubble.className = "grow-ai-bubble";
  bubble.innerHTML = `<svg viewBox="0 0 24 24"><path fill="white" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;

  const chatWindow = document.createElement("div");
  chatWindow.className = "grow-ai-window";

  const closeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
  const attachIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
  const micIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
  const sendIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  chatWindow.innerHTML = `
    <div class="grow-ai-header">
      <span>Grow AI Assistant</span>
      <span class="grow-ai-close" id="grow-close-btn">${closeIcon}</span>
    </div>
    <div class="grow-ai-body" id="grow-ai-body">
      <div class="grow-ai-message grow-ai-bot-message">"Welcome to our store! 👋 How can I assist your shopping today? Ask me about sizes, prices, or share a photo of what you're looking for :)</div>
    </div>
    <div class="grow-ai-footer-container">
      <div class="grow-preview-area" id="grow-preview-area">
        <span id="grow-preview-content"></span>
        <span class="remove-btn" id="grow-remove-attachment">&times;</span>
      </div>
      <div class="grow-ai-footer">
        <input type="file" id="grow-file-input" accept="image/*" style="display: none;" />
        <button class="grow-icon-btn" id="grow-attach-btn" title="Attach Image">${attachIcon}</button>
        <button class="grow-icon-btn" id="grow-mic-btn" title="Record Voice">${micIcon}</button>
        <input type="text" class="grow-ai-input" id="grow-text-input" placeholder="Ask something..." />
        <button class="grow-send-btn" id="grow-send-btn">${sendIcon}</button>
      </div>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(chatWindow);

  bubble.addEventListener("click", () => {
    chatWindow.style.display = chatWindow.style.display === "flex" ? "none" : "flex";
  });

  document.getElementById("grow-close-btn").addEventListener("click", () => {
    chatWindow.style.display = "none";
  });

  // DOM Elements
  const inputField = document.getElementById("grow-text-input");
  const messageBody = document.getElementById("grow-ai-body");
  const attachBtn = document.getElementById("grow-attach-btn");
  const fileInput = document.getElementById("grow-file-input");
  const micBtn = document.getElementById("grow-mic-btn");
  const sendBtn = document.getElementById("grow-send-btn");
  const previewArea = document.getElementById("grow-preview-area");
  const previewContent = document.getElementById("grow-preview-content");
  const removeAttachmentBtn = document.getElementById("grow-remove-attachment");

  // Image Handling
  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        currentImageBase64 = event.target.result;
        currentAudioBase64 = null;
        previewContent.innerHTML = `<img src="${currentImageBase64}" /> <span>Image attached</span>`;
        previewArea.style.display = "flex";
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = "";
  });

  // Voice Handling
  micBtn.addEventListener("click", async () => {
    if (isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      micBtn.classList.remove("recording");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.addEventListener("dataavailable", (event) => {
          audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener("stop", () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            currentAudioBase64 = reader.result;
            currentImageBase64 = null;
            previewContent.innerHTML = `<span style="color: #000000; font-weight: bold;">🎤 Voice message recorded</span>`;
            previewArea.style.display = "flex";
          };
          stream.getTracks().forEach((track) => track.stop());
        });

        mediaRecorder.start();
        isRecording = true;
        micBtn.classList.add("recording");
      } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Microphone access is required to send voice messages.");
      }
    }
  });

  removeAttachmentBtn.addEventListener("click", () => {
    currentImageBase64 = null;
    currentAudioBase64 = null;
    previewArea.style.display = "none";
  });

  // Send Message Logic
  const sendMessage = async () => {
    const userMessage = inputField.value.trim();
    if (!userMessage && !currentImageBase64 && !currentAudioBase64) return;

    inputField.value = "";
    previewArea.style.display = "none";

    // Build User Message in UI
    const userMsgDiv = document.createElement("div");
    userMsgDiv.className = "grow-ai-user-message";

    let msgHTML = userMessage;
    if (currentImageBase64) msgHTML += `<br><img src="${currentImageBase64}" style="max-height: 100px; border-radius: 8px; margin-top: 5px;" />`;
    if (currentAudioBase64) msgHTML += `<br><audio controls src="${currentAudioBase64}" style="max-width: 100%; margin-top: 5px;"></audio>`;

    userMsgDiv.innerHTML = msgHTML;
    messageBody.appendChild(userMsgDiv);
    messageBody.scrollTop = messageBody.scrollHeight;

    // Render Typing Indicator
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "grow-ai-message grow-ai-bot-message";
    loadingDiv.textContent = "Typing...";
    messageBody.appendChild(loadingDiv);
    messageBody.scrollTop = messageBody.scrollHeight;

    // Get exact shop domain dynamically
    const shopDomain = (window.Shopify && window.Shopify.shop) || window.location.hostname;

    // 100% Dynamic Payload (NO HARDCODED ORG_ID)
    const payload = {
      message: userMessage,
      shop: shopDomain,
      image: currentImageBase64,
      audio: currentAudioBase64,
    };

    currentImageBase64 = null;
    currentAudioBase64 = null;

    try {
      const response = await fetch(`${BACKEND_URL}/api/shopify/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Server status: ${response.status}`);
      const data = await response.json();
if (data.conversation_id) {
  subscribeToAgentLiveChat(data.conversation_id);
}
      if (messageBody.contains(loadingDiv)) messageBody.removeChild(loadingDiv);

      // শুধুমাত্র এআই রিপ্লাই থাকলে বটের মেসেজ রেন্ডার করবে
if (data.reply) {
  const botMsgDiv = document.createElement("div");
  botMsgDiv.className = "grow-ai-message grow-ai-bot-message";
  botMsgDiv.textContent = data.reply;

  if (data.image_url) {
    const img = document.createElement("img");
    img.src = data.image_url;
    img.style.maxHeight = "120px";
    img.style.borderRadius = "8px";
    img.style.marginTop = "8px";
    img.style.display = "block";
    botMsgDiv.appendChild(img);
  }

  messageBody.appendChild(botMsgDiv);
  messageBody.scrollTop = messageBody.scrollHeight;
}
    } catch (error) {
      if (messageBody.contains(loadingDiv)) messageBody.removeChild(loadingDiv);
      console.error("[Grow AI Widget Error]:", error);

      const errorDiv = document.createElement("div");
      errorDiv.className = "grow-ai-message grow-ai-bot-message";
      errorDiv.textContent = "Network error. Please try again later.";
      errorDiv.style.color = "red";
      messageBody.appendChild(errorDiv);
      messageBody.scrollTop = messageBody.scrollHeight;
    }
  };

  sendBtn.addEventListener("click", sendMessage);
  inputField.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
})();