import React from "react";
import { Bot } from "lucide-react";

export default function AiConfigBanner({ model, apiKey }) {
  return (
    <div className="rounded-xl border border-teal-500/20 bg-gradient-to-r from-teal-500/5 to-cyan-500/5 p-5 mb-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-teal-500/10">
          <Bot className="w-5 h-5 text-teal-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Groq AI Bot — {model}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Uses product inventory as ground-truth knowledge base for customer queries
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1.5 rounded-full ${
            apiKey ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {apiKey ? "Configured" : "Setup Required"}
        </span>
      </div>
    </div>
  );
}
