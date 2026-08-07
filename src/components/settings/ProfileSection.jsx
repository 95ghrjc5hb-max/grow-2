import React, { useState, useEffect } from "react";
import { User, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";

export default function ProfileSection() {
  const [userEmail, setUserEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("Administrator");
  const [loading, setLoading] = useState(true);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    async function loadUserData() {
      try {
        setLoading(true);

        // Fetch authenticated user session
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          setUserEmail(user.email || "");

          // Fetch profile details matching current user ID
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, role")
            .eq("id", user.id)
            .maybeSingle();

          if (profile) {
            setFullName(profile.full_name || user.user_metadata?.full_name || "");
            if (profile.role) setRole(profile.role);
          }
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, []);

  // Handle password reset email trigger
  const handleChangePassword = async () => {
    if (!userEmail) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        alert("Error sending password reset email: " + error.message);
      } else {
        setResetSent(true);
        alert(`Password reset link sent to ${userEmail}`);
      }
    } catch (err) {
      console.error("Password reset error:", err);
    }
  };

  return (
    <div className="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
      <div className="flex items-center gap-3 border-b border-white/10 pb-3">
        <User className="w-5 h-5 text-teal-400" />
        <h2 className="font-semibold text-white">Profile Details</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your Full Name"
            className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Email</label>
          <Input
            value={userEmail}
            disabled
            className="bg-white/5 border-white/10 text-slate-400 cursor-not-allowed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs text-slate-400">Role</p>
          <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">
            {role}
          </span>
        </div>

        <Button
          onClick={handleChangePassword}
          variant="outline"
          size="sm"
          className="border-white/10 text-slate-300 hover:bg-white/5 gap-1.5"
        >
          <KeyRound className="w-3.5 h-3.5" />
          {resetSent ? "Link Sent!" : "Change Password"}
        </Button>
      </div>
    </div>
  );
}
