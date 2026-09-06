import Groq from 'groq-sdk';

const TEXT_MODELS_PRIORITY = [
  'openai/gpt-oss-120b', 
  'qwen/qwen3.8-27b'
];
const VISION_MODELS_PRIORITY = [
  'qwen/qwen3.6-27b' 
];
const WHISPER_MODEL = 'whisper-large-v3';

function getGroqClient(apiKey) {
  const resolvedKey = apiKey || process.env.GROQ_API_KEY;
  if (!resolvedKey) throw new Error('Groq API Key is missing.');
  return new Groq({ apiKey: resolvedKey });
}

// 🎙️ GLOBAL MULTILINGUAL AUDIO TRANSCRIPTION
export async function transcribeAudioWithGroq(audioUrl, apiKey = null) {
  try {
    if (!audioUrl) return null;
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`Failed to download audio: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || 'audio/m4a';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let fileExt = 'm4a';
    if (contentType.includes('ogg')) fileExt = 'ogg';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) fileExt = 'm4a';
    else if (contentType.includes('wav')) fileExt = 'wav';
    else if (contentType.includes('mp3') || contentType.includes('mpeg')) fileExt = 'mp3';

    const formData = new FormData();
    const blob = new Blob([buffer], { type: contentType });
    formData.append('file', blob, `audio_input.${fileExt}`);
    formData.append('model', WHISPER_MODEL);

    const activeKey = apiKey || process.env.GROQ_API_KEY;
    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${activeKey}` },
      body: formData,
    });

    const result = await groqRes.json();
    if (result && result.text && result.text.trim()) {
      return result.text.trim();
    }
    return null;
  } catch (err) {
    console.error('[groqProvider] Transcribe Error:', err.message);
    return null;
  }
}

// 💬 FAST TEXT & VISION COMPLETION
export async function callGroqChat({ messages, apiKey, modelPriority = null, isVision = false }) {
  const groq = getGroqClient(apiKey);
  
  const baseList = isVision ? VISION_MODELS_PRIORITY : TEXT_MODELS_PRIORITY;
  const modelsToTry = modelPriority 
    ? [modelPriority, ...baseList.filter(m => m !== modelPriority)]
    : baseList;

  // Preserve the array if it contains image_url for Groq Vision
  const safeMessages = messages.map((m) => {
    let role = (m.role === 'system' || m.role === 'assistant') ? m.role : 'user';
    
    let finalContent = m.content;
    if (!Array.isArray(m.content)) {
        finalContent = String(m.content || '');
    }

    return { role, content: finalContent };
  });

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: safeMessages,
        model,
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: 'json_object' }, 
      });

      const content = chatCompletion.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (err) {
      lastError = err;
      console.warn(`[groqProvider] Model ${model} failed (${err.message}). Trying fallback...`);
    }
  }

  throw lastError || new Error('All configured Groq models failed.');
}