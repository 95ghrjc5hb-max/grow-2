import { whatsappTemplateService } from '../services/whatsappTemplateService.js';

export const createTemplate = async (req, res) => {
    try {
        const orgId = req.orgId || req.org_id || req.user?.org_id || req.user?.id;
        const { name, category, language, bodyText } = req.body;

        if (!name || !bodyText) {
            return res.status(400).json({ error: 'Template name and body text are required.' });
        }

        const result = await whatsappTemplateService.createTemplate(orgId, {
            name,
            category: category || 'UTILITY',
            language: language || 'en_US',
            bodyText
        });

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error('[WHATSAPP_TEMPLATE_CREATE_ERROR]:', error.response?.data || error.message);
        const metaMessage = error.response?.data?.error?.message || error.message;
        return res.status(error.response?.status || 500).json({ error: metaMessage });
    }
};

export const getTemplates = async (req, res) => {
    try {
        const orgId = req.orgId || req.org_id || req.user?.org_id || req.user?.id;
        const templates = await whatsappTemplateService.listTemplates(orgId);
        return res.status(200).json({ success: true, data: templates });
    } catch (error) {
        console.error('[WHATSAPP_TEMPLATE_LIST_ERROR]:', error.response?.data || error.message);
        const metaMessage = error.response?.data?.error?.message || error.message;
        return res.status(error.response?.status || 500).json({ error: metaMessage });
    }
};