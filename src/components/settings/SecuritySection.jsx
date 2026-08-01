import React, { useState } from "react";
import { ShieldCheck, Monitor, LogOut } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export default function SecuritySection() {
  const [is2FA, setIs2FA] = useState(false);

  return (
    <div className="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <ShieldCheck className="w-5 h-5 text-teal-400" />
        <h2 className="font-semibold text-white">Security & Sessions</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
          <div>
            <p className="text-sm font-medium text-white">2FA Authentication</p>
            <p className="text-xs text-slate-400">Two-factor authentication for higher security</p>
          </div>
          <Switch checked={is2FA} onCheckedChange={setIs2FA} />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Active Sessions</p>
          <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="w-4 h-4 text-teal-400" />
              <div>
                <p className="text-xs font-medium text-white">Mac OS • Chrome</p>
                <p className="text-[10px] text-teal-400">Current Session</p>
              </div>
            </div>
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 gap-1.5">
          <LogOut className="w-3.5 h-3.5" /> Terminate All Sessions
        </Button>
      </div>
    </div>
  );
}
