import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../../hooks/use-auth';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Phone, 
  Mail,
  Users, 
  Building2,
  CreditCard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Megaphone,
  Hash,
  Plug,
  ClipboardList,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/analytics', icon: TrendingUp, label: 'Analytics' },
  { href: '/messaging', icon: MessageSquare, label: 'Messaging', badge: 3 },
  { href: '/voice', icon: Phone, label: 'Voice Calls' },
  { href: '/email', icon: Mail, label: 'Email' },
  { href: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { href: '/phone-numbers', icon: Hash, label: 'Phone Numbers' },
];

const adminItems: NavItem[] = [
  { href: '/users', icon: Users, label: 'Users' },
  { href: '/subaccounts', icon: Building2, label: 'Sub-Accounts' },
  { href: '/api-integration', icon: Plug, label: 'API & Integrations' },
  { href: '/compliance', icon: Shield, label: 'Compliance' },
  { href: '/logs', icon: ClipboardList, label: 'Activity Logs' },
  { href: '/billing', icon: CreditCard, label: 'Billing' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export function ModernSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = location === item.href;
    const Icon = item.icon;

    return (
      <Link href={item.href}>
        <motion.div
          whileHover={{ x: isCollapsed ? 0 : 4 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group",
            isActive 
              ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30" 
              : "text-gray-300 hover:bg-white/10 hover:text-white"
          )}
        >
          {isActive && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 w-1 h-8 bg-white rounded-r-full"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "ml-2")} />
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="text-sm font-medium whitespace-nowrap overflow-hidden"
              >
                {item.label}
              </motion.span>
            )}
          </AnimatePresence>
          {item.badge && !isCollapsed && (
            <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {item.badge}
            </span>
          )}
        </motion.div>
      </Link>
    );
  };

  return (
    <motion.div
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative h-screen bg-gradient-to-b from-[#1e3a8a] to-[#1e40af] text-white flex flex-col shadow-2xl"
    >
      {/* Logo */}
      <div className="p-6 flex items-center justify-between">
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Elite Financial</h1>
                <p className="text-xs text-blue-200">Communications</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-white hover:bg-white/10 ml-auto"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      <Separator className="bg-white/10" />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {!isCollapsed && (
          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-blue-200 uppercase tracking-wider">
              Admin
            </p>
          </div>
        )}

        {adminItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </div>

      <Separator className="bg-white/10" />

      {/* User Profile */}
      <div className="p-4">
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all cursor-pointer",
          isCollapsed && "justify-center"
        )}>
          <Avatar className="w-10 h-10 border-2 border-white/20">
            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white font-semibold">
              {user?.firstName?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="flex-1 min-w-0 overflow-hidden"
              >
                <p className="text-sm font-medium truncate">{user?.firstName || 'User'}</p>
                <p className="text-xs text-blue-200 truncate">{user?.email || ''}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {!isCollapsed && (
          <Button
            onClick={logout}
            variant="ghost"
            className="w-full mt-2 text-white hover:bg-white/10 justify-start gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        )}
      </div>
    </motion.div>
  );
}
