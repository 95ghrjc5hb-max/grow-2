// Lemon Squeezy Checkout URL Generator
export const createLemonSqueezyCheckout = async ({ variantId, workspaceId, userEmail, planName }) => {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;

  if (!apiKey || !storeId) {
    // API Key না থাকলে ডাটাবেস সরাসরি আপডেট করার ফলব্যাক লিঙ্ক (টেস্টিংয়ের জন্য)
    return `${process.env.BACKEND_URL}/api/v1/settings/billing/mock-success?workspaceId=${workspaceId}&plan=${encodeURIComponent(planName)}`;
  }

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: userEmail,
            custom: {
              workspace_id: workspaceId,
              plan_name: planName
            }
          }
        },
        relationships: {
          store: {
            data: { type: 'stores', id: storeId.toString() }
          },
          variant: {
            data: { type: 'variants', id: variantId.toString() }
          }
        }
      }
    })
  });

  const json = await response.json();
  return json.data?.attributes?.url;
};