import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Advanced AI Support Agent using Groq LLM
 */
export const generateAiReply = async ({ customerMessage, storeProducts, storeOrders, conversationHistory }) => {
  try {
    const systemPrompt = `
      You are an elite AI Customer Support Agent for an E-commerce store.
      Your task is to provide polite, concise, and helpful responses to customers.
      
      [STORE CONTEXT]
      Available Products: ${JSON.stringify(storeProducts || [])}
      Recent Customer Orders: ${JSON.stringify(storeOrders || [])}
      
      [RULES]
      1. Keep answers under 3 sentences unless detailed order status is requested.
      2. Always check product inventory before confirming availability.
      3. Be warm, professional, and use natural human language.
    `;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...(conversationHistory || []),
        { role: 'user', content: customerMessage }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request right now.";
  } catch (error) {
    console.error('🔴 [AI AGENT ERROR]:', error.message);
    return "Thank you for reaching out! A human agent will assist you shortly.";
  }
};
