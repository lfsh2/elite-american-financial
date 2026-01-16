import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  Phone,
  Mail,
  BarChart3,
  TrendingUp,
  Megaphone,
  Clock,
  Users,
  UserPlus,
  CreditCard,
  Settings,
  PhoneCall,
  Link as LinkIcon,
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile sidebar when location changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location]);

  if (!user) return null;

  const sidebarLinks = [
    { href: "/", label: "Dashboard", icon: <BarChart3 className="h-5 w-5" /> },
    { href: "/analytics", label: "Analytics", icon: <TrendingUp className="h-5 w-5" /> },
    { href: "/sms", label: "SMS Inbox", icon: <MessageSquare className="h-5 w-5" /> },
    { href: "/campaigns", label: "Campaigns", icon: <Megaphone className="h-5 w-5" /> },
    { href: "/voice", label: "Voice Calls", icon: <Phone className="h-5 w-5" /> },
    { href: "/email", label: "Email", icon: <Mail className="h-5 w-5" /> },
    { href: "/phone-numbers", label: "Phone Numbers", icon: <PhoneCall className="h-5 w-5" /> },
    { href: "/logs", label: "Logs", icon: <Clock className="h-5 w-5" /> },
  ];

  const adminLinks = [
    { href: "/users", label: "Users", icon: <Users className="h-5 w-5" /> },
    { href: "/subaccounts", label: "Sub-accounts", icon: <UserPlus className="h-5 w-5" /> },
    { href: "/billing", label: "Billing", icon: <CreditCard className="h-5 w-5" /> },
    { href: "/settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
  ];

  // Calculate credit usage percentage
  const creditLimit = 1000;
  const usagePercentage = Math.min(100, Math.max(0, (user.credits / creditLimit) * 100));

  return (
    <>
      {/* Mobile sidebar backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex-col bg-white border-r border-neutral-200 md:relative md:flex transform transition-transform duration-200 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          className
        )}
      >
        <div className="flex flex-col flex-grow pt-5 overflow-y-auto hide-scrollbar">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4">
            <div className="flex items-center space-x-2 mb-6">
              <MessageSquare className="text-blue-600" size={28} />
              <span className="text-xl font-bold">Elite Financial</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 pb-4 space-y-1 mt-6">
            {sidebarLinks.map((link) => (
              <div key={link.href}>
                <a 
                  href={link.href}
                  className={cn(
                    "group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full text-left",
                    location === link.href
                      ? "bg-primary-50 text-primary"
                      : "text-neutral-600 hover:bg-primary-50 hover:text-primary"
                  )}
                >
                  <span className={cn(
                    "mr-3",
                    location === link.href
                      ? "text-primary"
                      : "text-neutral-400 group-hover:text-primary"
                  )}>
                    {link.icon}
                  </span>
                  {link.label}
                </a>
              </div>
            ))}
            
            {/* Admin Section */}
            <div className="pt-4 border-t border-neutral-200">
              <div className="px-2 mb-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Admin
              </div>
              {adminLinks.map((link) => (
                <div key={link.href}>
                  <a 
                    href={link.href}
                    className={cn(
                      "group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full text-left",
                      location === link.href
                        ? "bg-primary-50 text-primary"
                        : "text-neutral-600 hover:bg-primary-50 hover:text-primary"
                    )}
                  >
                    <span className={cn(
                      "mr-3",
                      location === link.href
                        ? "text-primary"
                        : "text-neutral-400 group-hover:text-primary"
                    )}>
                      {link.icon}
                    </span>
                    {link.label}
                  </a>
                </div>
              ))}
            </div>
          </nav>
          
          {/* Credit Usage */}
          <div className="px-4 pb-4">
            <div className="p-4 bg-neutral-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-neutral-700">Credits Usage</h3>
                <span className="text-xs text-neutral-500">{user.credits} / {creditLimit}</span>
              </div>
              <Progress value={usagePercentage} className="h-2 bg-neutral-200" />
              <div className="mt-2">
                <a 
                  href="/billing"
                  className="text-xs text-primary hover:text-primary-700 font-medium bg-transparent border-none cursor-pointer p-0"
                >
                  Buy more credits
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu button - visible on small screens */}
      <button
        type="button"
        className="fixed z-50 p-2 m-2 text-neutral-500 rounded-md md:hidden hover:text-neutral-900 focus:outline-none"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>
    </>
  );
}
