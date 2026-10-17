import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'https://api.growcorebot.com/api/v1';

export default function WhatsAppTemplateModal({ isOpen, onClose }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    const [form, setForm] = useState({
        name: 'order_status_update',
        category: 'UTILITY',
        language: 'en_US',
        bodyText: 'Hello {{1}}, your order #{{2}} has been confirmed and is being prepared for shipping.'
    });

   const getAuthHeaders = () => {
        let token = "";
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    const sessionData = JSON.parse(localStorage.getItem(key));
                    token = sessionData.access_token || "";
                    break;
                }
            }
        } catch (e) {
            console.error("Token extraction failed", e);
        }
        return { Authorization: `Bearer ${token}` };
    };

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await axios.get(`${API_BASE}/whatsapp/templates/list`, {
                headers: getAuthHeaders()
            });
            setTemplates(res.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch templates:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchTemplates();
        }
    }, [isOpen]);

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            setError(null);
            setSuccessMessage(null);

            await axios.post(`${API_BASE}/whatsapp/templates/create`, form, {
                headers: getAuthHeaders()
            });

            setSuccessMessage('Template submitted to Meta successfully!');
            fetchTemplates();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit template to Meta.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl text-slate-100">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#1e293b]/50">
                    <div>
                        <h3 className="text-lg font-semibold text-white">WhatsApp Message Templates</h3>
                        <p className="text-xs text-slate-400">Manage transactional & utility message templates via WhatsApp Cloud API</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                    {/* Alerts */}
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
                            {successMessage}
                        </div>
                    )}

                    {/* Creation Form */}
                    <form onSubmit={handleCreate} className="space-y-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                        <h4 className="text-sm font-semibold text-emerald-400">Create New Meta Template</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-xs font-medium text-slate-400 mb-1">Template Name (Identifier)</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                                <select
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="UTILITY">UTILITY</option>
                                    <option value="MARKETING">MARKETING</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Body Text (with variables)</label>
                            <textarea
                                rows="3"
                                value={form.bodyText}
                                onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs focus:outline-none focus:border-emerald-500"
                                required
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
                            >
                                {submitting ? 'Submitting to Meta...' : 'Submit Template'}
                            </button>
                        </div>
                    </form>

                    {/* Live Templates List */}
                    <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Live Meta Templates</h4>
                        {loading ? (
                            <p className="text-xs text-slate-500">Loading templates from Meta...</p>
                        ) : templates.length === 0 ? (
                            <p className="text-xs text-slate-500">No message templates found on Meta WABA.</p>
                        ) : (
                            <div className="space-y-2">
                                {templates.map((tpl, i) => (
                                    <div key={i} className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-lg flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-semibold text-slate-200">{tpl.name}</span>
                                                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">{tpl.category}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 mt-1 max-w-md truncate">
                                                {tpl.components?.find((c) => c.type === 'BODY')?.text}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                                            tpl.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                        }`}>
                                            {tpl.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}