import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2 } from "lucide-react";

export default function BotConfigModal({ open, onOpenChange, initialConfig, onSaveSuccess }) {
  const [formData, setFormData] = useState({
    provider: "Groq Cloud",
    model: "llama-3.1-8b-instant",
    api_key: "",
    system_prompt: ""
  });
  const [isSaving, setIsSaving] = useState(false);

  // মোডাল ওপেন হলে বা initialConfig আপডেট হলে স্থানীয় স্টেট আপডেট হবে
  useEffect(() => {
    if (open && initialConfig) {
      setFormData({
        provider: initialConfig.provider || "Groq Cloud",
        model: initialConfig.model || "llama-3.1-8b-instant",
        api_key: initialConfig.api_key || "",
        system_prompt: initialConfig.system_prompt || ""
      });
    }
  }, [open, initialConfig]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveSuccess(formData);
      onOpenChange(false); // সেভ সফল হলে মোডাল বন্ধ হবে
    } catch (err) {
      console.error("Failed to save bot configuration:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg text-white">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-semibold">AI Bot Configuration</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">LLM Provider</label>
            <Input 
              value={formData.provider} 
              readOnly 
              className="bg-white/5 border-white/10 text-slate-400 cursor-not-allowed" 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Model</label>
            <Input 
              value={formData.model} 
              readOnly 
              className="bg-white/5 border-white/10 text-slate-400 cursor-not-allowed" 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">API Key (Optional / Custom Key)</label>
            <Input 
              type="password" 
              placeholder="gsk_..." 
              value={formData.api_key} 
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })} 
              className="bg-white/5 border-white/10 focus:border-teal-500" 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">System Prompt</label>
            <Textarea 
              required
              rows={4}
              placeholder="Use this product inventory dataset as the primary ground-truth..." 
              value={formData.system_prompt} 
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })} 
              className="bg-white/5 border-white/10 focus:border-teal-500 min-h-[110px]" 
            />
          </div>

          <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20">
            <p className="text-xs text-teal-400">
              <span className="font-semibold">System Prompt Logic:</span> "Use this product inventory dataset as the primary ground-truth knowledge base to reply to customer pricing and detail queries via Groq."
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-slate-300">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-teal-500 hover:bg-teal-600 text-black font-semibold gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
