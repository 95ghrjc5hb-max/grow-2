import React, { useState } from "react";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function NotificationSection() {
  const [alerts, setAlerts] = useState({
    orderAlerts: true,
    incomingMessages: true,
    aiHandoff: false,
  });

  return (
    <div className="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Bell className="w-5 h-5 text-teal-400" />
        <h2 className="font-semibold text-white">Notification Preferences</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">New order alerts</p>
            <p className="text-xs text-slate-400">Push notifications when a new order is confirmed</p>
          </div>
          <Switch 
            checked={alerts.orderAlerts} 
            onCheckedChange={(v) => setAlerts({ ...alerts, orderAlerts: v })} 
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Incoming messages</p>
            <p className="text-xs text-slate-400">Alerts for unread customer inquiries</p>
          </div>
          <Switch 
            checked={alerts.incomingMessages} 
            onCheckedChange={(v) => setAlerts({ ...alerts, incomingMessages: v })} 
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">AI bot handoff</p>
            <p className="text-xs text-slate-400">Alerts when AI requests human intervention</p>
          </div>
          <Switch 
            checked={alerts.aiHandoff} 
            onCheckedChange={(v) => setAlerts({ ...alerts, aiHandoff: v })} 
          />
        </div>
      </div>
    </div>
  );
}
