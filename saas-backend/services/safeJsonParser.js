// services/safeJsonParser.js

const FALLBACK_RESPONSE = Object.freeze({
  reply: "Thank you for reaching out. How can I assist you with our products today?",
  orderData: null,
  image_url: null,
  handover: false
});

export function safeParseAIResponse(rawContent) {
  // ১. টার্মিনালে আসল আউটপুট দেখার জন্য লগ (ডিবাগিংয়ের জন্য সেরা)
  console.log("\n--- [RAW AI OUTPUT] ---\n", rawContent, "\n-----------------------\n");

  if (!rawContent || typeof rawContent !== 'string') {
    return FALLBACK_RESPONSE;
  }

  try {
    // ২. টেক্সট থেকে শুধু { ... } JSON অংশটুকু নিখুঁতভাবে বের করা
    const firstBrace = rawContent.indexOf('{');
    const lastBrace = rawContent.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = rawContent.slice(firstBrace, lastBrace + 1);
      
      try {
        const parsed = JSON.parse(jsonCandidate);
        
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // ৩. AI মাঝেমাঝে 'reply' এর বদলে 'message' বা 'response' কী (key) ব্যবহার করে, তাই সব অপশন চেক করা
          let aiReply = parsed.reply || parsed.message || parsed.response || parsed.text || parsed.answer;
          
          if (!aiReply || aiReply.trim() === "") {
             aiReply = "I understand. Let me check our inventory for you."; 
          }

          return {
            reply: aiReply.trim(),
            image_url: parsed.image_url && parsed.image_url !== 'null' ? parsed.image_url : null,
            orderData: parsed.orderData || null,
            handover: parsed.handover === true
          };
        }
      } catch (jsonError) {
        console.error("[JSON Parse Error]:", jsonError.message);
      }
    }

    // ৪. যদি JSON পার্স ফেইল করে, তবে  রিমুভ করে ক্লিন টেক্সট রিটার্ন করা
    let cleanText = rawContent.replace(/[\s\S]*?<\/think>/gi, '').trim();
    
    // যদি আনক্লোজড  থেকে যায়
    if (cleanText.includes('')) {
       cleanText = cleanText.split('')[0].trim();
    }
    
    cleanText = cleanText.replace(/```(?:json)?([\s\S]*?)```/gi, '$1').trim();

    if (cleanText.length > 2) {
      return {
        reply: cleanText,
        orderData: null,
        image_url: null,
        handover: false
      };
    }

    return FALLBACK_RESPONSE;

  } catch (err) {
    console.error("[Parser Critical Error]:", err.message);
    return FALLBACK_RESPONSE;
  }
}