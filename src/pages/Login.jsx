import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Lock, Mail, Loader2, ArrowRight, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "../supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  // Smart Redirection
  const from = location.state?.from?.pathname || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError("Please enter both email and passcode.");
      return;
    }

    setLoading(true);

    try {
      // Calling Supabase Authentication Engine
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (error) throw error;

      toast({
        title: "Welcome Back",
        description: "Authentication successful.",
      });

      navigate(from, { replace: true });

    } catch (err) {
      setError(err.message || "Invalid credentials. Access denied.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    toast({
      title: "Notice",
      description: "Google OAuth Provider integration active in production build.",
    });
  };

  return (
    <AuthLayout
      icon={<LogIn className="w-6 h-6 text-teal-400" />}
      title="Welcome Back"
      subtitle="Enter your security credentials to access your dashboard"
      footer={
        <p className="text-sm text-slate-400 text-center mt-4">
          Don't have an account?{" "}
          <Link to="/register" className="text-teal-400 hover:underline transition-colors font-medium">
            Create one
          </Link>
        </p>
      }
    >
      {/* OAuth Google Provider Button */}
      <Button
        variant="outline"
        type="button"
        className="w-full h-12 bg-slate-900/40 border-slate-800 hover:bg-slate-800 text-slate-200 text-sm font-medium mb-6 transition-colors"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[#0f1117] px-3 text-slate-500 font-mono tracking-wider">Or</span>
        </div>
      </div>

      {/* Security Alert / Error Notification Box */}
      {error && (
        <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Credentials Pipeline */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-300 font-medium text-xs uppercase tracking-wider">
            Email Address
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9 h-11 bg-slate-900/50 border-slate-800 text-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50"
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-slate-300 font-medium text-xs uppercase tracking-wider">
              Passcode
            </Label>
            <Link to="/forgot-password" className="text-xs text-teal-400 hover:underline transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9 h-11 bg-slate-900/50 border-slate-800 text-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50"
              required
            />
          </div>
        </div>

        {/* Action Button */}
        <Button
          type="submit"
          className="w-full h-12 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all mt-6"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Authenticating Core...
            </>
          ) : (
            <>
              Access Terminal <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
