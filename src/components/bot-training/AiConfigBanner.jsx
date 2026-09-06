import React from 'react';
import { Bot, Settings2 } from 'lucide-react';

export default function AIConfigBanner({ model, apiKey, onConfigure }) {
  const isConfigured = Boolean(apiKey && apiKey.trim().length > 0);

  return (
    <div className="rounded-xl border border-teal-500/20 bg-gradient-to-r from-teal-500/5 to-cyan-500/5 p-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-teal-500/10">
          <Bot className="w-5 h-5 text-teal-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
            Groq AI Bot — <span className="text-teal-400 font-mono">{model || 'llama-3.1-8b-instant'}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Uses product inventory as ground-truth knowledge base for customer queries
          </p>
        </div>

        {/* Clickable Action Button */}
        <button
          type="button"
          onClick={onConfigure}
          className={`flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full font-medium cursor-pointer transition-all hover:scale-105 active:scale-95 ${
            isConfigured
              ? 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          {isConfigured ? 'Configured' : 'Setup Required'}
        </button>
      </div>
    </div>
  );
}