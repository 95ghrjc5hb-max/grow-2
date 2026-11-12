import React from 'react';
import { Bot, Settings2, Globe } from 'lucide-react';
import { LANGUAGES } from '../../constants/languages';

export default function AIConfigBanner({ model, apiKey, onConfigure, language = 'auto', onLanguageChange }) {
  const isConfigured = Boolean(apiKey && apiKey.trim().length > 0);

  return (
    <div className="rounded-xl border border-teal-500/20 bg-gradient-to-r from-teal-500/5 to-cyan-500/5 p-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-teal-500/10">
          <Bot className="w-5 h-5 text-teal-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
          AI Sales Agent
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Uses product inventory as ground-truth knowledge base for customer queries
          </p>
        </div>

        {/* Inline Language Selector (Exact Cursor Position) */}
        <div className="flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-teal-400 transition-all">
          <Globe className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <select
            value={language || 'auto'}
            onChange={(e) => onLanguageChange && onLanguageChange(e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer max-w-[170px] truncate"
            title="Select Bot Reply Language"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                {lang.code === 'auto' ? lang.name : `${lang.name} (${lang.native})`}
              </option>
            ))}
          </select>
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