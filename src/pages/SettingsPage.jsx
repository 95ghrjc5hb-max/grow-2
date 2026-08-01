import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw } from "lucide-react";

// Sub-components Import
import ProfileSection from "../components/settings/ProfileSection.jsx";
import StoreSection from "../components/settings/StoreSection.jsx";
import NotificationSection from "../components/settings/NotificationSection.jsx";
import SecuritySection from "../components/settings/SecuritySection.jsx";
import DeveloperSection from "../components/settings/DeveloperSection.jsx";
import DangerZoneSection from "../components/settings/DangerZoneSection.jsx";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);

  const handleSaveAll = async () => {
    setLoading(true);
    // API call logic to save all settings to Supabase
    setTimeout(() => setLoading(false), 800);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto text-slate-200 space-y-8">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings & Preferences</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your store, security, team, and integration preferences.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5">
            <RotateCcw className="w-4 h-4 mr-2" /> Discard
          </Button>
          <Button 
            onClick={handleSaveAll} 
            disabled={loading}
            className="bg-teal-500 hover:bg-teal-600 text-black font-semibold"
          >
            <Save className="w-4 h-4 mr-2" /> {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Grid Layout (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <ProfileSection />
          <StoreSection />
          <NotificationSection />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <SecuritySection />
          <DeveloperSection />
          <DangerZoneSection />
        </div>
      </div>
    </div>
  );
}
