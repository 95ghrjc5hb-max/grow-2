import axios from 'axios';
import { supabase } from '../config/supabase.js';

class WhatsAppTemplateService {
    // 100% Dynamic WABA resolution via Meta Graph API
    async getWabaCredentials(orgId) {
        const { data: integration, error } = await supabase
            .from('integrations')
            .select('page_id, access_token')
            .eq('org_id', orgId)
            .eq('platform', 'whatsapp')
            .single();

        if (error || !integration?.access_token) {
            throw new Error('Active WhatsApp integration not found for this workspace.');
        }

        const accessToken = integration.access_token;

        // Enterprise Dynamic Discovery: Query Meta for associated WABA accounts
        const metaRes = await axios.get(
            'https://graph.facebook.com/v21.0/me/whatsapp_business_accounts',
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        const wabaAccounts = metaRes.data?.data || [];
        if (wabaAccounts.length === 0) {
            throw new Error('No WhatsApp Business Account (WABA) associated with this access token.');
        }

        // Dynamically select the primary connected WABA ID
        const wabaId = wabaAccounts[0].id;

        return { wabaId, accessToken };
    }

    // Creates a new WhatsApp Message Template on Meta
    async createTemplate(orgId, { name, category = 'UTILITY', language = 'en_US', bodyText }) {
        const { wabaId, accessToken } = await this.getWabaCredentials(orgId);

        // Sanitize template name: Meta requires lowercase, numbers, and underscores only
        const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

        // Dynamically build sample variables for Meta template compliance
        const variableMatches = bodyText.match(/\{\{\d+\}\}/g) || [];
        const bodyComponent = {
            type: 'BODY',
            text: bodyText
        };

        if (variableMatches.length > 0) {
            const sampleValues = variableMatches.map((_, idx) => `Sample ${idx + 1}`);
            bodyComponent.example = {
                body_text: [sampleValues]
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