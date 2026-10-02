import 'dotenv/config';

async function testGroq(key, index) {
    if (!key) return;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        if (res.ok) console.log(`✅ GROQ Key ${index}: Perfectly OK!`);
        else console.log(`❌ GROQ Key ${index}: Failed (Status: ${res.status})`);
    } catch (e) { console.log(`❌ GROQ Key ${index}: Network Error`); }
}

async function testCerebras(key, index) {
    if (!key) return;
    try {
        const res = await fetch('https://api.cerebras.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        if (res.ok) console.log(`✅ CEREBRAS Key ${index}: Perfectly OK!`);
        else console.log(`❌ CEREBRAS Key ${index}: Failed (Status: ${res.status})`);
    } catch (e) { console.log(`❌ CEREBRAS Key ${index}: Network Error`); }
}

async function testGemini(key, index) {
    if (!key) return;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${key}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "models/gemini-embedding-2",
                content: { parts: [{ text: "Hello World" }] }
            })
        });
        if (res.ok) console.log(`✅ GEMINI Key ${index}: Perfectly OK! (Embedding Ready)`);
        else console.log(`❌ GEMINI Key ${index}: Failed (Status: ${res.status})`);
    } catch (e) { console.log(`❌ GEMINI Key ${index}: Network Error`); }
}

async function runAllTests() {
    console.log("🔍 Checking all 18 AI API Keys from .env...\n");
    console.log("--- GROQ KEYS ---");
    for (let i = 1; i <= 6; i++) await testGroq(process.env[`GROQ_API_KEY_${i}`], i);
    
    console.log("\n--- CEREBRAS KEYS ---");
    for (let i = 1; i <= 6; i++) await testCerebras(process.env[`CEREBRAS_API_KEY_${i}`], i);
    
    console.log("\n--- GEMINI KEYS ---");
    for (let i = 1; i <= 6; i++) await testGemini(process.env[`GEMINI_API_KEY_${i}`], i);
    
    console.log("\n🎉 All tests completed!");
}

runAllTests();