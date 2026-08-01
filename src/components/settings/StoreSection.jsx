import React from "react";
import { Store, Globe, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function StoreSection() {
  return (
    <div className="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Store className="w-5 h-5 text-teal-400" />
        <h2 className="font-semibold text-white">Business & Store Config</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Store / Business Name</label>
          <Input 
            defaultValue="GROW Store" 
            placeholder="e.g. My E-commerce Brand" 
            className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500" 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" /> Default Currency
            </label>
            <Input 
              defaultValue="BDT (৳)" 
              className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500" 
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" /> Timezone
            </label>
            <Input 
              defaultValue="Asia/Dhaka (GMT+6)" 
              className="bg-white/5 border-white/10 text-white focus-visible:ring-teal-500" 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
