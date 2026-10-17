import axios from 'axios';
import { supabase } from '../config/supabase.js';

class WhatsAppTemplateService {
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

       // Load dynamically from Railway / Environment Variables
        const wabaId = process.env.META_WABA_ID;
        if (!wabaId) {
            throw new Error('META_WABA_ID is missing from environment variables.');
        }

        const accessToken = integration.access_token;
        return { wabaId, accessToken };
    }

    async createTemplate(orgId, { name, category = 'UTILITY', language = 'en_US', bodyText }) {
        const { wabaId, accessToken } = await this.getWabaCredentials(orgId);

        // Meta template name requirements: lowercase letters, numbers, and underscores only
        const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

        // Dynamically extract variable placeholders e.g. {{1}}, {{2}}
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