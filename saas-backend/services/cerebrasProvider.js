// services/cerebrasProvider.js

const CEREBRAS_MODELS = [
    "gpt-oss-120b",
    "qwen-3.8-27b",
    "gemma-4-31b"
];

export async function callCerebrasChat({ messages, apiKey }) {
    if (!apiKey) throw new Error("Cerebras API Key is missing.");
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '');
    let lastError = null;

    for (const model of CEREBRAS_MODELS) {
        try {
            const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${cleanKey}`, // ব্যাকটিক (``) ব্যবহার করা হয়েছে
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model,
                    messages: messages.map(m => ({
                        role: m.role,
                        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                    })),
                    response_format: { type: "json_object" },
                    temperature: 0.2
                })
            });

            if (res.ok) {
                const data = await res.json();
                return data.choices?.[0]?.message?.content;
            } else {
                const errText = await res.text();
                console.warn(`[CerebrasProvider] ${model} failed (${res.status}): ${errText}`);
                lastError = new Error(errText);
            }
        } catch (err) {
            console.warn(`[CerebrasProvider] ${model} network error: ${err.message}`);
            lastError = err;
        }
    }

    throw lastError || new Error("All Cerebras models failed.");
}