import React from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function BotConfigModal({ open, onOpenChange, configForm, setConfigForm, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">AI Bot Configuration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">LLM Provider</label>
            <Input value={configForm.provider} readOnly className="bg-white/5 border-white/10 text-slate-400" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Model</label>
            <Input value={configForm.model} readOnly className="bg-white/5 border-white/10 text-slate-400" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">API Key</label>
            <Input
              type="password"
              value={configForm.api_key}
              onChange={(e) => setConfigForm({ ...configForm, api_key: e.target.value })}
              placeholder="gsk_..."
              className="bg-white/5 border-white/10"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">System Prompt</label>
            <Textarea
              value={configForm.system_prompt}
              onChange={(e) => setConfigForm({ ...configForm, system_prompt: e.target.value })}
              placeholder="Use this product inventory dataset as the primary ground-truth knowledge base to reply to customer pricing and detail queries via Groq."
              className="bg-white/5 border-white/10 min-h-[100px]"
            />
          </div>
          <div className="p-3 rounded-lg bg-teal-500/5 border border-teal-500/15">
            <p className="text-xs text-teal-400">
              System prompt logic: "Use this product inventory dataset as the primary ground-truth knowledge base to reply to customer pricing and detail queries via Groq."
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-slate-300">
              Cancel
            </Button>
            <Button onClick={onSave} className="bg-teal-500 hover:bg-teal-600 text-black gap-2">
              <Save className="w-4 h-4" /> Save Configuration
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
