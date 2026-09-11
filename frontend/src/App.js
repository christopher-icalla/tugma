import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";

import Home from "@/pages/public/Home";
import HowItWorks from "@/pages/public/HowItWorks";
import RegulatoryIntelligence from "@/pages/public/RegulatoryIntelligence";
import ControlsPublic from "@/pages/public/ControlsPublic";
import StellarPublic from "@/pages/public/StellarPublic";
import SecurityPublic from "@/pages/public/SecurityPublic";
import Contact from "@/pages/public/Contact";

import Login from "@/pages/auth/Login";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";

import AppShell from "@/components/app/AppShell";
import Dashboard from "@/pages/app/Dashboard";
import RegulatoryIntelligenceApp from "@/pages/app/RegulatoryIntelligenceApp";
import ControlsApp from "@/pages/app/ControlsApp";
import Transactions from "@/pages/app/Transactions";
import TransactionDetail from "@/pages/app/TransactionDetail";
import Exceptions from "@/pages/app/Exceptions";
import ExceptionDetail from "@/pages/app/ExceptionDetail";
import Evidence from "@/pages/app/Evidence";
import Reports from "@/pages/app/Reports";
import Settings from "@/pages/app/Settings";

function App() {
  return (
    <div className="App min-h-screen bg-[#090d16]">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" theme="dark" richColors />
          <Routes>
            {/* Public website */}
            <Route path="/" element={<Home />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/regulatory-intelligence" element={<RegulatoryIntelligence />} />
            <Route path="/controls" element={<ControlsPublic />} />
            <Route path="/stellar" element={<StellarPublic />} />
            <Route path="/security" element={<SecurityPublic />} />
            <Route path="/contact" element={<Contact />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Authenticated application */}
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="regulatory-intelligence" element={<RegulatoryIntelligenceApp />} />
              <Route path="controls" element={<ControlsApp />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="transactions/:txId" element={<TransactionDetail />} />
              <Route path="exceptions" element={<Exceptions />} />
              <Route path="exceptions/:code" element={<ExceptionDetail />} />
              <Route path="evidence" element={<Evidence />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
