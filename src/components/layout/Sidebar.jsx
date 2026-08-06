import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  Bot,
  Package,
  Zap,
  Settings,
  LogOut
} from "lucide-react";
// 1. Imported useAuth from AuthContext
import { useAuth } from "@/lib/AuthContext"; 

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Unified Inbox", path: "/inbox", icon: Inbox },
  { label: "Bot Training & Inventory", path: "/training", icon: Bot },
  { label: "Order Management", path: "/orders", icon: Package },
  { label: "Integrations", path: "/integrations", icon: Zap },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function Sidebar({ onCloseMobile }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // 2. Extracted logout function from useAuth
  const { logout } = useAuth();

  // Sign out handler function
  const handleSignOut = async (e) => {
    e.preventDefault();
    await logout(); // 3. Triggered Supabase sign out protocol
  };

  return (
    <div className="flex flex-col h-full p-4 justify-between select-none">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 via-cyan-500 to-emerald-400 p-[1px] shadow-lg shadow-teal-500/20">
            <Zap className="w-5 h-5 fill-teal-400/20 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-wider bg-gradient-to-r from-teal-300 via-cyan-200 to-white bg-clip-text text-transparent">
              GROW
            </span>
            <span className="text-[10px] font-semibold tracking-widest text-teal-400/70 -mt-1 uppercase">
              Next-Gen SaaS
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={`relative group flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? "text-teal-300 bg-gradient-to-r from-teal-500/15 via-cyan-500/10 to-transparent border border-teal-500/30 shadow-lg shadow-teal-500/5"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 w-1 h-5 bg-gradient-to-b from-teal-400 to-cyan-400 rounded-full shadow-sm shadow-teal-400" />
                )}
                <Icon
                  className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${
                    isActive ? "text-teal-400" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      
      {/* Footer Section: Privacy, Terms & Sign Out */}
      <div className="pt-5 border-t border-white/10 flex flex-col gap-4">
        
        {/* Futuristic Privacy & Terms */}
        <div className="flex justify-center gap-6 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <Link to="/privacy" className="relative group hover:text-teal-400 transition-colors duration-300">
            Privacy
            <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-teal-400 transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <span className="text-slate-700">•</span>
          <Link to="/terms" className="relative group hover:text-teal-400 transition-colors duration-300">
            Terms
            <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-teal-400 transition-all duration-300 group-hover:w-full"></span>
          </Link>
        </div>

        {/* Advanced Glowing Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 text-slate-400 bg-white/5 border border-white/5 backdrop-blur-sm hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 hover:shadow-[0_0_20px_rgba(244,63,94,0.15)] group"
        >
          <LogOut className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
          <span>Sign Out</span>
        </button>
      </div>

    </div>
  );
}
