// services/groqProvider.js

const TEXT_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b"
];

const VISION_MODELS = [
    "qwen/qwen3.8-27b"
];

const AUDIO_MODEL = "whisper-large-v3";

export async function callGroqChat({ messages, apiKey, isVision = false }) {
    if (!apiKey) throw new Error("Groq API Key is missing.");
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '');
    const modelList = isVision ? VISION_MODELS : TEXT_MODELS;
    let lastError = null;

    for (const model of modelList) {
        try {
            const payload = {
                model,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                temperature: 0.2,
                max_tokens: 1000
            };

            if (!isVision) {
                payload.response_format = { type: "json_object" };
            }

            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${cleanKey}`, // ব্যাকটিক (``) ফিক্সড
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                return data.choices?.[0]?.message?.content;
            } else {
                const errText = await res.text();
                console.warn(`[GroqProvider] ${model} failed (${res.status}): ${errText}`);
                lastError = new Error(errText);
            }
        } catch (err) {
            console.warn(`[GroqProvider] ${model} network error: ${err.message}`);
            lastError = err;
        }
    }

    throw lastError || new Error("All Groq models failed.");
}

export async function transcribeAudioWithGroq(audioUrl, apiKey = null) {
    try {
        if (!audioUrl) return null;
        const cleanKey = (apiKey || process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY || "").trim();
        if (!cleanKey) throw new Error("Groq API Key missing for audio.");

        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error(`Audio fetch failed: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const formData = new FormData();
        const blob = new Blob([buffer], { type: 'audio/m4a' });
        formData.append('file', blob, 'audio_input.m4a');
        formData.append('model', AUDIO_MODEL);

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cleanKey}` }, // ব্যাকটিক (``) ফিক্সড
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            return data.text?.trim() || null;
        }
        return null;
        
    } catch (err) {
        console.error('[GroqProvider Audio Error]:', err.message);
        return null;
    }
}