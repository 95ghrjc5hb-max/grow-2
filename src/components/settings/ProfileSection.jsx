import React from "react";
import { User, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ProfileSection() {
  return (
    <div className="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <User className="w-5 h-5 text-teal-400" />
        <h2 className="font-semibold text-white">Profile Details</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
          <Input 
            defaultValue="Nazmul Islam" 
            className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500" 
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Email</label>
          <Input 
            defaultValue="nazmulislam62617@gmail.com" 
            disabled 
            className="bg-white/5 border-white/10 text-slate-400 cursor-not-allowed" 
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs text-slate-400">Role</p>
          <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium inline-block mt-1">
            Administrator
          </span>
        </div>
        <Button variant="outline" size="sm" className="border-white/10 text-slate-300 hover:bg-white/5 gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> Change Password
        </Button>
      </div>
    </div>
  );
}
