// Use IIFE to prevent variable scope conflicts in Shopify storefront
(function() {
    console.log("Grow AI Chat Widget Loading...");

    // 1. Extract org_id and shop domain from the script URL
    const currentScript = document.currentScript;
    const scriptUrl = new URL(currentScript.src);
    const orgId = scriptUrl.searchParams.get("org_id");
    const shop = scriptUrl.searchParams.get("shop");

    // 2. Inject CSS styles for the widget
    const style = document.createElement('style');
    style.innerHTML = `
        .grow-ai-bubble {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background-color: #10B981; 
            border-radius: 50%;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483647; 
            transition: transform 0.2s ease-in-out;
        }
        .grow-ai-bubble:hover { transform: scale(1.05); }
        .grow-ai-window {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 350px;
            height: 500px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            z-index: 2147483647;
            display: none; 
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #e5e7eb;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .grow-ai-header {
            background: #10B981;
            color: white;
            padding: 16px;
            font-weight: 600;
            font-size: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .grow-ai-close { cursor: pointer; font-size: 20px; }
        .grow-ai-body {
            flex: 1;
            padding: 15px;
            background: #f9fafb;
            overflow-y: auto;
        }
        .grow-ai-message {
            background: white;
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid #e5e7eb;
            font-size: 14px;
            margin-bottom: 10px;
            display: inline-block;
            max-width: 80%;
            color: #374151;
        }
        .grow-ai-footer {
            padding: 12px;
            border-top: 1px solid #e5e7eb;
            background: white;
        }
        .grow-ai-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            box-sizing: border-box;
            outline: none;
            font-size: 14px;
        }
        .grow-ai-input:focus { border-color: #10B981; }
    `;
    document.head.appendChild(style);

    // 3. Create the chat bubble element
    const bubble = document.createElement('div');
    bubble.className = 'grow-ai-bubble';
    bubble.innerHTML = `<svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;
    
    // 4. Create the chat window element
    const chatWindow = document.createElement('div');
    chatWindow.className = 'grow-ai-window';
    chatWindow.innerHTML = `
        <div class="grow-ai-header">
            <span>Grow AI Assistant</span>
            <span class="grow-ai-close" id="grow-close-btn">&times;</span>
        </div>
        <div class="grow-ai-body">
            <div class="grow-ai-message">
                Hello! Welcome to our store. Feel free to ask any questions about our products.
            </div>
        </div>
        <div class="grow-ai-footer">
            <input type="text" class="grow-ai-input" placeholder="Ask about a product..." />
        </div>
    `;

    // 5. Append elements to the document body
    document.body.appendChild(bubble);
    document.body.appendChild(chatWindow);

    // 6. Add event listeners for toggling the chat window
    bubble.addEventListener('click', () => {
        chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('grow-close-btn').addEventListener('click', () => {
        chatWindow.style.display = 'none';
    });

})();