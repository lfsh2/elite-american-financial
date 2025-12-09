import React from 'react';
import { Route, Switch } from 'wouter';
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from './hooks/use-auth';

// Pages
import Dashboard from './pages/Dashboard';
import Messaging from './pages/Messaging';
import Campaigns from './pages/Campaigns';
import VoiceCalls from './pages/VoiceCalls';
import Email from './pages/Email';
import Users from './pages/Users';
import SubAccounts from './pages/SubAccounts';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import PhoneNumbers from './pages/PhoneNumbers';
import ApiIntegrationPage from './pages/ApiIntegrationPage';
import SmsComplianceSettings from './pages/SmsComplianceSettings';
import Compliance from './pages/Compliance';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import NotFound from './pages/not-found';

// Layout
import Layout from './components/layout/Layout';

function AppRoutes() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const ProtectedRoute = ({ component: Component, ...rest }: any) => {
    if (!isAuthenticated) {
      return <Route {...rest}><Login /></Route>;
    }
    
    return (
      <Route {...rest}>
        <Layout>
          <Component />
        </Layout>
      </Route>
    );
  };

  return (
    <div className="app">
      <Switch>
        {/* Public Routes */}
        <Route path="/">
          {isAuthenticated ? 
            <Layout><Dashboard /></Layout> : 
            <Login />
          }
        </Route>
        <Route path="/login">
          <Login />
        </Route>
        <Route path="/register">
          <Register />
        </Route>

        {/* Protected Routes */}
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/messaging" component={Messaging} />
        <ProtectedRoute path="/campaigns" component={Campaigns} />
        <ProtectedRoute path="/voice" component={VoiceCalls} />
        <ProtectedRoute path="/email" component={Email} />
        <ProtectedRoute path="/users" component={Users} />
        <ProtectedRoute path="/subaccounts" component={SubAccounts} />
        <ProtectedRoute path="/logs" component={Logs} />
        <ProtectedRoute path="/settings" component={Settings} />
        <ProtectedRoute path="/billing" component={Billing} />
        <ProtectedRoute path="/phone-numbers" component={PhoneNumbers} />
        <ProtectedRoute path="/api-integration" component={ApiIntegrationPage} />
        <ProtectedRoute path="/sms-compliance" component={SmsComplianceSettings} />
        <ProtectedRoute path="/compliance" component={Compliance} />

        {/* 404 Route */}
        <Route>
          <NotFound />
        </Route>
      </Switch>
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