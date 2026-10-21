const SUPABASE_URL = "https://osauxwvzkinjaadpqgre.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KEKFu0ltlIGA9s-d7lMczQ_t4_HB_im";
let realtimeChannel = null;

function subscribeToAgentLiveChat(convId) {
  console.log("🟢 subscribeToAgentLiveChat called with ID:", convId);
  const sb = window.supabase;
  if (!sb) {
    console.error("❌ window.supabase is missing. Script not loaded!");
    return;
  }
  if (realtimeChannel) {
    console.log("⚠️ Already subscribed to channel.");
    return;
  }
  const supabaseClient = sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("🟢 Supabase Client Initialized for Realtime");

  realtimeChannel = supabaseClient
    .channel('storefront_' + convId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: 'conversation_id=eq.' + convId
    }, (payload) => {
      console.log("📢 REALTIME PAYLOAD RECEIVED:", payload);
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
    })
    .subscribe((status, err) => {
      console.log("📡 Realtime Connection Status:", status);
      if (err) console.error("❌ Realtime Subscription Error:", err);
    });
}

(function () {
  console.log("Grow AI Chat Widget Loaded (Enterprise Multi-Tenant Mode)");
  const BACKEND_URL = "https://api.growcorebot.com";

  let currentImageBase64 = null;
  let currentAudioBase64 = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

  const style = document.createElement("style");
  style.innerHTML = `
    #grow-ai-bubble{position:fixed;bottom:30px;right:30px;width:60px;height:60px;background-color:#10b981;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:999999;transition:transform 0.2s ease;}
    #grow-ai-bubble:hover{transform:scale(1.05);}
    #grow-ai-bubble svg{width:28px;height:28px;fill:white;}
    #grow-ai-window{position:fixed;bottom:105px;right:30px;width:380px;height:550px;background:white;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.15);display:none;flex-direction:column;overflow:hidden;z-index:999999;border:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
    #grow-ai-header{background:#000000;color:white;padding:16px;font-size:16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;}
    #grow-ai-close{cursor:pointer;font-size:20px;display:flex;align-items:center;}
    #grow-ai-body{flex:1;padding:16px;background:#f9fafb;overflow-y:auto;display:flex;flex-direction:column;gap:12px;}
    .grow-ai-message{max-width:80%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.4;word-wrap:break-word;}
    .grow-ai-user-message{background:#000000;color:white;border-bottom-right-radius:4px;align-self:flex-end;}
    .grow-ai-bot-message{align-self:flex-start;background:white;border:1px solid #e5e7eb;color:#111827;border-bottom-left-radius:4px;}
    #grow-ai-footer-container{display:flex;flex-direction:column;border-top:1px solid #e5e7eb;background:white;}
    #grow-preview-area{padding:4px 12px;display:none;align-items:center;gap:8px;background:#f3f4f6;font-size:12px;}
    #grow-preview-area img{max-height:40px;border-radius:4px;}
    #grow-remove-attachment{cursor:pointer;color:red;font-weight:bold;margin-left:auto;}
    #grow-ai-footer{padding:10px 14px;display:flex;align-items:center;gap:8px;}
    .grow-icon-btn{background:none;border:none;cursor:pointer;padding:6px;border-radius:50%;display:flex;align-items:center;justify-content:center;}
    .grow-icon-btn:hover{background:#f3f4f6;color:#000000;}
    .grow-icon-btn.recording{color:red;animation:pulse 1.5s infinite;}
    @keyframes pulse{0%{transform:scale(1);}50%{transform:scale(1.2);}100%{transform:scale(1);}}
    #grow-text-input{flex:1;padding:10px;border:1px solid #d1d5db;border-radius:20px;outline:none;font-size:14px;}
    #grow-text-input:focus{border-color:#000000;}
    #grow-send-btn{background:#000000;color:white;border:none;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;}
  `;
  document.head.appendChild(style);

  const bubble = document.createElement("div");
  bubble.id = "grow-ai-bubble";
  bubble.className = "grow-ai-bubble";
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path fill="white" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

  const chatWindow = document.createElement("div");
  chatWindow.id = "grow-ai-window";
  chatWindow.className = "grow-ai-window";

  const closeIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  const attachIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>';
  const micIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>';
  const sendIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

  chatWindow.innerHTML = `
    <div id="grow-ai-header">
      <span>Grow AI Assistant</span>
      <span class="grow-ai-close" id="grow-close-btn">${closeIcon}</span>
    </div>
    <div id="grow-ai-body">
      <div class="grow-ai-message grow-ai-bot-message">Welcome to our store! 👋 How can I assist your shopping today?</div>
    </div>
    <div class="grow-ai-footer-container" id="grow-ai-footer-container">
      <div id="grow-preview-area">
        <span id="grow-preview-content"></span>
        <span class="remove-btn" id="grow-remove-attachment">&times;</span>
      </div>
      <div class="grow-ai-footer" id="grow-ai-footer">
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

  const inputField = document.getElementById("grow-text-input");
  const messageBody = document.getElementById("grow-ai-body");
  const attachBtn = document.getElementById("grow-attach-btn");
  const fileInput = document.getElementById("grow-file-input");
  const micBtn = document.getElementById("grow-mic-btn");
  const sendBtn = document.getElementById("grow-send-btn");
  const previewArea = document.getElementById("grow-preview-area");
  const previewContent = document.getElementById("grow-preview-content");
  const removeAttachmentBtn = document.getElementById("grow-remove-attachment");

  attachBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        currentImageBase64 = event.target.result;
        currentAudioBase64 = null;
        previewContent.innerHTML = '<img src="' + currentImageBase64 + '" /> <span>Image attached</span>';
        previewArea.style.display = "flex";
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = "";
  });

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
            previewContent.innerHTML = '<span style="color:#000000;font-weight:bold;">🎤 Voice message recorded</span>';
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

  const sendMessage = async () => {
    const userMessage = inputField.value.trim();
    if (!userMessage && !currentImageBase64 && !currentAudioBase64) return;

    inputField.value = "";
    previewArea.style.display = "none";

    const userMsgDiv = document.createElement("div");
    userMsgDiv.className = "grow-ai-message grow-ai-user-message";

    let msgHTML = userMessage;
    if (currentImageBase64) msgHTML += '<br><img src="' + currentImageBase64 + '" style="max-height:100px;border-radius:8px;margin-top:5px;">';
    if (currentAudioBase64) msgHTML += '<br><audio controls src="' + currentAudioBase64 + '" style="max-width:180px;margin-top:5px;"></audio>';

    userMsgDiv.innerHTML = msgHTML;
    messageBody.appendChild(userMsgDiv);
    messageBody.scrollTop = messageBody.scrollHeight;

    const loadingDiv = document.createElement("div");
    loadingDiv.className = "grow-ai-message grow-ai-bot-message";
    loadingDiv.textContent = "Typing...";
    messageBody.appendChild(loadingDiv);
    messageBody.scrollTop = messageBody.scrollHeight;

    const shopDomain = (window.Shopify && window.Shopify.shop) || window.location.hostname;

    const payload = {
      message: userMessage,
      shop: shopDomain,
      image: currentImageBase64,
      audio: currentAudioBase64
    };

    currentImageBase64 = null;
    currentAudioBase64 = null;

    try {
      const response = await fetch(BACKEND_URL + "/api/shopify/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Server status: " + response.status);
      const data = await response.json();

      if (data.conversation_id) {
        subscribeToAgentLiveChat(data.conversation_id);
      }

      if (messageBody.contains(loadingDiv)) messageBody.removeChild(loadingDiv);

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