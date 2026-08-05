import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

// Auth Context & Core Providers
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import ScrollToTop from "@/components/ScrollToTop";
import ProtectedRoute from "@/components/ProtectedRoute";
import PageNotFound from "@/lib/PageNotFound";

// Public Pages
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword"; 

// App Layout & Protected Pages
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import UnifiedInbox from "@/pages/UnifiedInbox";
import BotTraining from "@/pages/BotTraining";
import OrderManagement from "@/pages/OrderManagement";
import Integrations from "@/pages/Integrations";
import SettingsPage from "@/pages/SettingsPage";
import NewBotTraining from "@/pages/NewBotTraining";

// Legal Pages
import PrivacyPolicy from "@/components/PrivacyPolicy";
import Terms from "@/components/Terms";

// ==========================================
// 🛡️ NEW: PUBLIC ROUTE GUARD
// Prevents authenticated users from accessing Login/Register pages
// ==========================================
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  
  if (isLoadingAuth) {
    // If still verifying token, show nothing or a minimal fallback
    // (ProtectedRoute handles the main cool 3D loader)
    return null; 
  }
  
  // If user is already logged in, bounce them directly to the dashboard
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
};

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            {/* ========================================== */}
            {/* 🌐 PUBLIC AUTH ROUTES (Protected by PublicRoute) */}
            {/* ========================================== */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
            
            {/* Open Pages */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />

            {/* ========================================== */}
            {/* 🔒 PROTECTED SAAS CORE ROUTES */}
            {/* ========================================== */}
            <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              {/* Index redirect to dashboard */}
              <Route index element={<Navigate to="/dashboard" replace />} />
              
              {/* Nested Dashboard Routes */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="inbox" element={<UnifiedInbox />} />
              <Route path="training" element={<BotTraining />} />
              <Route path="orders" element={<OrderManagement />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="/new-training" element={<NewBotTraining />} />
            </Route>

            {/* ========================================== */}
            {/* ❌ 404 FALLBACK ROUTE */}
            {/* ========================================== */}
            <Route path="*" element={<PageNotFound />} />
          </Routes>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  );
}
