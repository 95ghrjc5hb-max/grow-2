import axios from 'axios';
import { supabase } from '../config/supabase.js';

class WhatsAppTemplateService {
    // Dynamically resolves WABA ID and Access Token from the connected integration
    async getWabaCredentials(orgId) {
        const { data: integration, error } = await supabase
            .from('integrations')
            .select('page_id, access_token')
            .eq('org_id', orgId)
            .eq('platform', 'whatsapp')
            .single();

        if (error || !integration?.access_token || !integration?.page_id) {
            throw new Error('Active WhatsApp integration not found for this workspace.');
        }

        const phoneNumberId = integration.page_id;
        const accessToken = integration.access_token;

        // Query Meta Graph API to resolve the parent WhatsApp Business Account (WABA) ID
       const metaRes = await axios.get(
            `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=whatsapp_business_account`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        );

        const wabaId = metaRes.data?.whatsapp_business_account?.id;
        if (!wabaId) {
            throw new Error('Failed to resolve WABA ID from Meta API.');
        }

        return { wabaId, accessToken };
    }

    // Creates a new WhatsApp Message Template on Meta
    async createTemplate(orgId, { name, category = 'UTILITY', language = 'en_US', bodyText }) {
        const { wabaId, accessToken } = await this.getWabaCredentials(orgId);

        // Sanitize template name: Meta requires lowercase, numbers, and underscores only
        const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

        // Meta requires an 'example' parameter if positional parameters (e.g. {{1}}, {{2}}) are present
        const hasVariables = /\{\{\d+\}\}/.test(bodyText);
        const bodyComponent = {
            type: 'BODY',
            text: bodyText
        };

        if (hasVariables) {
            bodyComponent.example = {
                body_text: [['Customer Name', '1024']]
            };
        }

        const payload = {
            name: sanitizedName,
            category: category.toUpperCase(),
            language,
            components: [bodyComponent]
        };

        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    }

    // Retrieves list of message templates directly from Meta
    async listTemplates(orgId) {
        const { wabaId, accessToken } = await this.getWabaCredentials(orgId);

        const response = await axios.get(
            `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,category,language,components`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        );

        return response.data?.data || [];
    }
}

export const whatsappTemplateService = new WhatsAppTemplateService();