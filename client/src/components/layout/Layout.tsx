import React, { ReactNode } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '../../hooks/use-auth';
import { AccountProvider, useAccount } from '../../contexts/AccountContext';
import AccountSelector from '../AccountSelector';
import AIChatbot from '../AIChatbot';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Megaphone, 
  Phone, 
  Mail, 
  Users, 
  Building2, 
  ClipboardList, 
  CreditCard, 
  Settings, 
  LogOut,
  Bell,
  HelpCircle,
  Plug
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <AccountProvider>
      <LayoutContent>{children}</LayoutContent>
    </AccountProvider>
  );
}

function LayoutContent({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { currentAccount, isOverviewMode } = useAccount();

  const handleLogout = async () => {
    await logout();
    setLocation('/');
  };

  // Get current context label for header
  const getContextLabel = () => {
    if (isOverviewMode) return null;
    if (currentAccount) return currentAccount.name;
    return null;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-[#3347c8] text-white flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-[#4156da]/30">
          <h1 className="text-2xl font-bold">SyncGrid</h1>
          <p className="text-xs text-blue-200">Communications Platform</p>
        </div>

        {/* Account Selector */}
        <div className="p-3 border-b border-[#4156da]/30">
          <AccountSelector />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          <ul>
            <NavItem href="/dashboard" icon={<LayoutDashboard size={20} />} active={location === '/dashboard'}>Dashboard</NavItem>
            <NavItem href="/messaging" icon={<MessageSquare size={20} />} active={location === '/messaging'}>Messaging</NavItem>
            <NavItem href="/campaigns" icon={<Megaphone size={20} />} active={location === '/campaigns'}>Campaigns</NavItem>
            <NavItem href="/voice" icon={<Phone size={20} />} active={location === '/voice'}>Voice Calls</NavItem>
            <NavItem href="/email" icon={<Mail size={20} />} active={location === '/email'}>Email</NavItem>
            <NavItem href="/phone-numbers" icon={<Phone size={20} />} active={location === '/phone-numbers'}>Phone Numbers</NavItem>
            
            {/* Admin Section */}
            <li className="mt-4 mb-2 px-4">
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Admin</span>
            </li>
            <NavItem href="/users" icon={<Users size={20} />} active={location === '/users'}>Users</NavItem>
            <NavItem href="/subaccounts" icon={<Building2 size={20} />} active={location === '/subaccounts'}>Accounts</NavItem>
            <NavItem href="/api-integration" icon={<Plug size={20} />} active={location === '/api-integration'}>API & Integrations</NavItem>
            <NavItem href="/logs" icon={<ClipboardList size={20} />} active={location === '/logs'}>Logs</NavItem>
            <NavItem href="/billing" icon={<CreditCard size={20} />} active={location === '/billing'}>Billing</NavItem>
            <NavItem href="/settings" icon={<Settings size={20} />} active={location === '/settings'}>Settings</NavItem>
          </ul>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-[#4156da]/30">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 rounded-full bg-[#4156da] flex items-center justify-center text-white font-bold text-sm mr-3">
              {user?.firstName?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.firstName || 'User'}</p>
              <p className="text-xs text-blue-200 truncate">{user?.email || ''}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 border border-[#4963e4] hover:bg-[#4156da] rounded-md text-xs font-medium transition-colors flex items-center justify-center"
          >
            <LogOut size={14} className="mr-2" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm h-16 flex items-center px-6">
          <div className="flex-1">
            <div className="flex items-center">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                {getPageTitle(location)}
              </h2>
              {getContextLabel() && (
                <span className="ml-3 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                  {getContextLabel()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">3</span>
              <Bell size={20} className="text-gray-600 dark:text-gray-300 cursor-pointer" />
            </div>
            <div>
              <HelpCircle size={20} className="text-gray-600 dark:text-gray-300 cursor-pointer" />
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {children}
        </main>
      </div>

      {/* AI Chatbot */}
      <AIChatbot />
    </div>
  );
}

type NavItemProps = {
  href: string;
  icon: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
};

function NavItem({ href, icon, active, children }: NavItemProps) {
  return (
    <li className="mb-1">
      <Link
        href={href}
        className={`flex items-center px-4 py-3 text-sm ${
          active ? 'bg-[#4156da] font-medium' : 'hover:bg-[#4156da]/50'
        } transition-colors duration-150`}
      >
        <span className="w-6 mr-3 flex items-center justify-center">{icon}</span>
        {children}
      </Link>
    </li>
  );
}

function getPageTitle(location: string): string {
  const path = location.split('/')[1];
  
  const titles: Record<string, string> = {
    dashboard: 'Dashboard',
    messaging: 'Messaging',
    campaigns: 'Campaigns',
    voice: 'Voice Calls',
    email: 'Email',
    'phone-numbers': 'Phone Numbers',
    users: 'Users',
    subaccounts: 'Sub-Accounts',
    logs: 'Activity Logs',
    billing: 'Billing & Credits',
    settings: 'Settings',
    'api-integration': 'API Integration',
    'sms-compliance': 'SMS Compliance',
    compliance: 'Compliance'
  };
  
  return titles[path] || 'Dashboard';
}