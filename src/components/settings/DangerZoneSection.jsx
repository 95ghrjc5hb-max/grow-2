import React from "react";
import { AlertTriangle, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DangerZoneSection() {
  return (
    <div className="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <h2 className="font-semibold text-white">Data & Danger Zone</h2>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
          <div>
            <p className="text-xs font-medium text-white">Export Workspace Data</p>
            <p className="text-[10px] text-slate-400">Download complete archive in JSON format</p>
          </div>
          <Button size="sm" variant="outline" className="border-white/10 text-slate-200 text-xs gap-1">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
          <div>
            <p className="text-xs font-medium text-rose-400">Delete Workspace</p>
            <p className="text-[10px] text-slate-400">Permanently remove this account and all data</p>
          </div>
          <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white text-xs gap-1">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
