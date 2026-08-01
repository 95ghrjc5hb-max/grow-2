import React, { useState } from "react";
import { Code2, Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function DeveloperSection() {
  const [copied, setCopied] = useState(false);
  const apiKey = "grow_sec_9kF87YDVhumnXauc7LJw_KDqMtC71";

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Code2 className="w-5 h-5 text-teal-400" />
        <h2 className="font-semibold text-white">Developer & Integrations</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Global Webhook URL</label>
          <div className="flex gap-2">
            <Input 
              defaultValue="https://api.your-own-saas.com/webhook" 
              className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500 text-xs" 
            />
            <Button size="sm" variant="outline" className="border-white/10 text-slate-200 shrink-0">
              Test
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">API Secret Key</label>
          <div className="flex gap-2">
            <Input 
              type="password" 
              value={apiKey} 
              readOnly 
              className="bg-white/5 border-white/10 text-slate-400 text-xs" 
            />
            <Button size="sm" variant="outline" onClick={handleCopy} className="border-white/10 text-slate-200 shrink-0">
              {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
