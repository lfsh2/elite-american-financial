import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../../hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, User, Lock, ArrowRight, MessageSquare, Phone, Shield, Zap } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1e3a8a] via-[#1e40af] to-[#3730a3] p-12 flex-col justify-between relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-300 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-400 rounded-full blur-3xl opacity-20"></div>
        </div>
        
        {/* Logo */}
        <div className="relative z-10">
          <img 
            src="/logo.png" 
            alt="TextFlow" 
            className="h-32 w-auto object-contain brightness-0 invert drop-shadow-lg"
          />
        </div>
        
        {/* Main content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold text-white leading-tight">
              Enterprise SMS & Voice Platform
            </h1>
            <p className="text-blue-100 text-xl max-w-lg leading-relaxed">
              Streamline your business communications with our powerful messaging and voice solutions.
            </p>
          </div>
          
          {/* Features - Clean list style */}
          <div className="space-y-4 pt-6">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
              <span className="text-white/90 text-base">Bulk SMS & MMS Campaigns</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
              <span className="text-white/90 text-base">Voice Calls & IVR</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
              <span className="text-white/90 text-base">A2P 10DLC Compliance</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
              <span className="text-white/90 text-base">REST API & Webhooks</span>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="relative z-10 text-blue-200 text-sm">
          © 2026 TextFlow AI. All rights reserved.
        </div>
      </div>
      
      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img 
              src="/logo.png" 
              alt="TextFlow" 
              className="h-12 w-auto object-contain"
            />
          </div>
          
          {/* Header */}
          <div className="text-center lg:text-left space-y-2">
            <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500">Sign in to your account to continue</p>
          </div>
          
          {error && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-700 font-medium">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="h-12 pl-10 bg-white border-gray-300 focus:bg-white focus:border-blue-500 focus:ring-blue-500 transition-colors rounded-lg shadow-sm"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-700 font-medium">Password</Label>
                <button type="button" className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 pl-10 bg-white border-gray-300 focus:bg-white focus:border-blue-500 focus:ring-blue-500 transition-colors rounded-lg shadow-sm"
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 rounded-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>
          
          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-gradient-to-b from-gray-50 to-white text-gray-400">or</span>
            </div>
          </div>
          
          {/* Demo credentials */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium mb-2">Demo Credentials</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white rounded-md p-2 border border-blue-100">
                <p className="text-gray-500">Admin</p>
                <p className="font-mono text-gray-700">admin / admin123</p>
              </div>
              <div className="bg-white rounded-md p-2 border border-blue-100">
                <p className="text-gray-500">Test User</p>
                <p className="font-mono text-gray-700">testuser / testpass123</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}