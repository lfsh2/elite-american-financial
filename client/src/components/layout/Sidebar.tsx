import React, { memo, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useAccount } from '@/contexts/AccountContext';
import { useTwilioAnalytics } from '@/hooks/useTwilioData';
import { ProviderLogo } from '@/components/shared/ProviderLogo';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  MessageSquare,
  Phone,
  TrendingUp,
  Megaphone,
  Hash,
  Users,
  Building2,
  CreditCard,
  Settings,
  Plug,
  ClipboardList,
  Shield,
  ChevronRight,
  LogOut,
  User,
  HelpCircle,
  Bell,
  Send,
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

// Admin-only items (super_admin role)
const adminOnlyItems: NavItem[] = [
  { title: 'Users', href: '/users', icon: Users },
  { title: 'Sub-Accounts', href: '/subaccounts', icon: Building2 },
  { title: 'Activity Logs', href: '/logs', icon: ClipboardList },
];

// Settings items for all users
const settingsItems: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar = memo(function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { analytics } = useTwilioAnalytics();
  const { currentAccount, accounts, selectAccount, isOverviewMode, selectOverview } = useAccount();
  
  // Determine if user is admin (super_admin) or client (user)
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  // Memoize inbox count calculation
  const inboxCount = useMemo(() => {
    return analytics?.messages.thisMonth.filter(m => m.direction === 'inbound').length || 0;
  }, [analytics?.messages.thisMonth]);

  // Memoize nav items to prevent recreation on every render
  const navItems: NavItem[] = useMemo(() => [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'Analytics', href: '/analytics', icon: TrendingUp },
    { title: 'SMS', href: '/sms', icon: MessageSquare, badge: inboxCount },
    { title: 'Voice Calls', href: '/voice', icon: Phone },
    { title: 'Contacts', href: '/contacts', icon: Users },
    { title: 'SMS Campaigns', href: '/sms-campaigns', icon: Send },
    { title: 'Phone Numbers', href: '/phone-numbers', icon: Hash },
  ], [inboxCount]);

  if (!user) return null;

  return (
    <div className="hidden border-r bg-white md:block w-64">
      <div className="flex h-full max-h-screen flex-col gap-2">
        {/* Logo */}
        <div className="flex h-20 items-center justify-center border-b px-0">
          <Link href="/dashboard">
            <div className="flex items-center justify-center cursor-pointer w-full">
              <img 
                src="/image.png" 
                alt="TextFlow" 
                className="h-16 w-[250px] object-contain scale-150"
              />
            </div>
          </Link>
        </div>

        {/* Account Switcher */}
        <div className="px-3 pt-4 pb-2">
          <Select
            value={isOverviewMode ? 'overview' : currentAccount?.id || ''}
            onValueChange={(value) => {
              if (value === 'overview') {
                selectOverview();
              } else {
                selectAccount(value);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select account">
                {isOverviewMode ? (
                  <span className="font-medium">All Accounts</span>
                ) : (
                  <div className="flex items-center gap-2">
                    {currentAccount?.provider && (
                      <ProviderLogo provider={currentAccount.provider} size="sm" />
                    )}
                    <span className="font-medium">{currentAccount?.name || 'Select Account'}</span>
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview">
                <div className="flex items-center gap-2">
                  <span className="font-medium">All Accounts</span>
                  <span className="text-xs text-muted-foreground">Overview</span>
                </div>
              </SelectItem>
              <Separator className="my-1" />
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <div className="flex items-center gap-2">
                    <ProviderLogo provider={account.provider} size="sm" />
                    <span className="font-medium">{account.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-3 px-3',
                      isActive && 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.title}</span>
                    {item.badge && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                        {item.badge}
                      </span>
                    )}
                  </Button>
                </Link>
              );
            })}
          </div>

          <Separator className="my-3" />

          {/* Admin-only section */}
          {isAdmin && (
            <div className="space-y-1 py-2">
              <div className="px-3 py-2">
                <h2 className="mb-2 px-2 text-xs font-semibold tracking-tight text-gray-500 uppercase">
                  Administration
                </h2>
              </div>
              {adminOnlyItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      className={cn(
                        'w-full justify-start gap-3 px-3',
                        isActive && 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{item.title}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          )}

          <Separator className="my-3" />

          {/* Settings section - visible to all users */}
          <div className="space-y-1 py-2">
            {settingsItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-3 px-3',
                      isActive && 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.title}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        {/* User Profile with Dropdown */}
        <div className="border-t p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 rounded-xl p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer group border border-transparent hover:border-blue-100 hover:shadow-sm">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-semibold text-sm shadow-md group-hover:shadow-lg transition-shadow">
                    {user.firstName?.[0] || 'U'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-white"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Bell className="mr-2 h-4 w-4" />
                <span>Notifications</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <HelpCircle className="mr-2 h-4 w-4" />
                <span>Help & Support</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});
