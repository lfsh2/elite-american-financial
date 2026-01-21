import React, { memo } from 'react';
import { Route, Switch } from 'wouter';
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from './hooks/use-auth';
import { AccountProvider } from './contexts/AccountContext';

// Pages
import Dashboard from './pages/Dashboard';
import Messaging from './pages/Messaging';
import Campaigns from './pages/Campaigns';
import SmsCampaigns from './pages/SmsCampaigns';
import SmsInbox from './pages/SmsInbox';
import VoiceCalls from './pages/VoiceCalls';
import Users from './pages/Users';
import SubAccounts from './pages/SubAccounts';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import PhoneNumbers from './pages/PhoneNumbers';
import ApiIntegrationPage from './pages/ApiIntegrationPage';
// import SmsComplianceSettings from './pages/SmsComplianceSettings'; // Hidden temporarily
// import Compliance from './pages/Compliance'; // Hidden temporarily
import Analytics from './pages/Analytics';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import NotFound from './pages/not-found';

// Layout Components
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import AIChatbot from './components/AIChatbot';

// Memoized Layout Shell - prevents re-render on route change
const LayoutShell = memo(function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>
      <AIChatbot />
    </div>
  );
});

// Protected content wrapper
function ProtectedContent() {
  return (
    <AccountProvider>
      <LayoutShell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/messaging" component={Messaging} />
          <Route path="/sms" component={SmsInbox} />
          <Route path="/campaigns" component={Campaigns} />
          <Route path="/sms-campaigns" component={SmsCampaigns} />
          <Route path="/voice" component={VoiceCalls} />
          <Route path="/users" component={Users} />
          <Route path="/subaccounts" component={SubAccounts} />
          <Route path="/logs" component={Logs} />
          <Route path="/settings" component={Settings} />
          {/* <Route path="/billing" component={Billing} /> */}
          <Route path="/phone-numbers" component={PhoneNumbers} />
          <Route path="/api-integration" component={ApiIntegrationPage} />
          {/* <Route path="/sms-compliance" component={SmsComplianceSettings} /> */}
          {/* <Route path="/compliance" component={Compliance} /> */}
          <Route path="/analytics" component={Analytics} />
          <Route component={NotFound} />
        </Switch>
      </LayoutShell>
    </AccountProvider>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  if (!isAuthenticated) {
    return (
      <div className="app">
        <Switch>
          <Route path="/register" component={Register} />
          <Route component={Login} />
        </Switch>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="app">
      <ProtectedContent />
      <Toaster />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;