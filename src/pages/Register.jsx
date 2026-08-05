import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Lock,
  Loader2,
  CheckCircle2,
  Shield,
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "../supabaseClient";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

export default function Register() {
  const navigate = useNavigate();

  // Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // UX & Security States
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [strength, setStrength] = useState(0);

  // OTP States
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  // Password Strength Calculation
  useEffect(() => {
    let score = 0;
    if (password.length >= 6) score += 1;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    setStrength(Math.min(score, 4));
  }, [password]);

  // Resend OTP Countdown Timer
  useEffect(() => {
    let timer;
    if (resendTimer > 0) {
      timer = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendTimer]);

  // Handle Initial Registration (Step 1)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();

    if (password !== confirmPassword) {
      setError("Passcodes do not match. Please verify.");
      return;
    }

    if (password.length < 6) {
      setError("Passcode must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      // Calling Supabase Auth Engine
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
      });

      if (error) throw error;

      toast({
        title: "Verification Code Dispatched",
        description: `Security token sent to ${cleanEmail}`,
      });

      setShowOtp(true);
      setResendTimer(60); // Start 60s cooldown for resend

    } catch (err) {
      setError(err.message || "Registration failed. Identity may already exist.");
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP Verification (Step 2)
  const handleVerify = async () => {
    setError("");

    if (otpCode.length < 6) {
      setError("Please input valid 6-digit cryptographic token.");
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      // Calling Supabase OTP Verification
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: otpCode,
        type: 'signup'
      });

      if (error) throw error;

      toast({
        title: "Identity Verified",
        description: "Welcome to GROW! Authentication complete.",
      });

      navigate("/dashboard", { replace: true });

    } catch (err) {
      setError(err.message || "Invalid or expired security code.");
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP Logic
  const handleResendOtp = async () => {
    if (resendTimer > 0 || isResending) return;

    setIsResending(true);
    setError("");
    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      });

      if (error) throw error;

      toast({
        title: "New Code Sent",
        description: `Fresh verification code sent to ${cleanEmail}`,
      });
      setResendTimer(60);
    } catch (err) {
      setError(err.message || "Unable to resend security code.");
    } finally {
      setIsResending(false);
    }
  };

  const handleGoogle = () => {
    toast({
      title: "Notice",
      description: "Google OAuth Provider integration active in production build.",
    });
  };

  // Futuristic Password Strength Indicator
  const getStrengthColor = () => {
    if (strength === 1) return "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)] border-rose-400/50";
    if (strength === 2) return "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)] border-amber-300/50";
    if (strength === 3) return "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] border-cyan-300/50";
    if (strength === 4) return "bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,1)] border-emerald-300/50";
    return "bg-slate-800/80 border-slate-700/50";
  };

  // ==========================================
  // VIEW 1: OTP VERIFICATION VIEW
  // ==========================================
  if (showOtp) {
    return (
      <AuthLayout
        icon={<Shield className="w-6 h-6 text-emerald-400" />}
        title="Verify Identity"
        subtitle={`Input the 6-digit access token sent to ${email}`}
      >
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-center mb-6 mt-2">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={(val) => setOtpCode(val)}
            autoFocus
          >
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="bg-slate-900/80 border-slate-800 text-teal-300 text-xl font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 transition-all rounded-lg w-12 h-14"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {/* Resend & Action Row */}
        <div className="flex items-center justify-between mb-6 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => {
              setShowOtp(false);
              setOtpCode("");
              setError("");
            }}
            className="flex items-center gap-1 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Change Email
          </button>

          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resendTimer > 0 || isResending}
            className={`flex items-center gap-1 transition-colors ${
              resendTimer > 0
                ? "text-slate-600 cursor-not-allowed"
                : "text-teal-400 hover:underline cursor-pointer"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend Code"}
          </button>
        </div>

        <Button
          className="w-full h-12 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all"
          onClick={handleVerify}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying Security Token...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirm & Access Terminal
            </>
          )}
        </Button>
      </AuthLayout>
    );
  }

  // ==========================================
  // VIEW 2: STANDARD REGISTRATION VIEW
  // ==========================================
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Initialize your access key for the GROW Platform"
      footer={
        <p className="text-sm text-slate-400 text-center mt-4">
          Already registered?{" "}
          <Link to="/login" className="text-teal-400 hover:underline transition-colors font-medium">
            Log in
          </Link>
        </p>
      }
    >
      <Button
        variant="outline"
        type="button"
        className="w-full h-11 text-sm font-medium mb-6 bg-slate-900/40 border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800" />
        </div>
        <div className="relative flex justify-center text-[11px] uppercase tracking-wider font-medium">
          <span className="bg-[#0f1117] px-3 text-slate-500 font-mono">Or register with email</span>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-300 font-medium text-xs uppercase tracking-wider">Email Address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9 h-11 bg-slate-900/50 border-slate-800 text-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-slate-300 font-medium text-xs uppercase tracking-wider">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9 pr-10 h-11 bg-slate-900/50 border-slate-800 text-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Cybernetic Password Strength Meter */}
          {password.length > 0 && (
            <div className="flex gap-1.5 mt-2 h-1">
              <div className={`flex-1 rounded-full transition-all duration-300 ${strength >= 1 ? getStrengthColor() : 'bg-slate-800'}`} />
              <div className={`flex-1 rounded-full transition-all duration-300 ${strength >= 2 ? getStrengthColor() : 'bg-slate-800'}`} />
              <div className={`flex-1 rounded-full transition-all duration-300 ${strength >= 3 ? getStrengthColor() : 'bg-slate-800'}`} />
              <div className={`flex-1 rounded-full transition-all duration-300 ${strength >= 4 ? getStrengthColor() : 'bg-slate-800'}`} />
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-slate-300 font-medium text-xs uppercase tracking-wider">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              id="confirm"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter passcode"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-9 h-11 bg-slate-900/50 border-slate-800 text-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50"
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-12 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all mt-6"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Initializing Registration...
            </>
          ) : (
            "Create Account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
