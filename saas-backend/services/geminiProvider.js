// services/geminiProvider.js

const GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash"
];

export async function callGeminiChat({ messages, apiKey }) {
    if (!apiKey) throw new Error("Gemini API Key is missing.");
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '');

    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');

    const contents = userMessages.map(m => {
        let parts = [];
        if (typeof m.content === 'string') {
            parts.push({ text: m.content });
        } else if (Array.isArray(m.content)) {
            m.content.forEach(item => {
                if (item.type === 'text') {
                    parts.push({ text: item.text });
                } else if (item.type === 'image_url' && item.image_url?.url) {
                    const match = item.image_url.url.match(/^data:(.+);base64,(.+)$/);
                    if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
                }
            });
        }
        return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });

    let lastError = null;

    for (const model of GEMINI_MODELS) {
        try {
            // ব্যাকটিক (``) ব্যবহার করা হয়েছে যাতে ${model} ও ${cleanKey} ভ্যালু ডায়নামিক্যালি বসে
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemMsg }] },
                    contents,
                    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
                })
            });

            if (res.ok) {
                const data = await res.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text;
            } else {
                const errText = await res.text();
                console.warn(`[GeminiProvider] ${model} failed (${res.status}): ${errText}`);
                lastError = new Error(errText);
            }
        } catch (err) {
            console.warn(`[GeminiProvider] ${model} network error: ${err.message}`);
            lastError = err;
        }
    }

    throw lastError || new Error("All Gemini models failed.");
}