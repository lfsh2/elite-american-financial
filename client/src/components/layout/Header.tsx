import { useState } from "react";
import { Link } from "wouter";
import { cn, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { 
  Search, 
  Plus, 
  Bell, 
  HelpCircle,
  LogOut, 
  User,
  Settings
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  if (!user) return null;

  return (
    <header className={cn("bg-white border-b border-neutral-200", className)}>
      <div className="px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Search */}
          <div className="hidden md:flex md:w-full max-w-sm">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-neutral-400" />
              </div>
              <Input
                className="block w-full pl-10 pr-3 py-2 placeholder-neutral-500"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center ml-4 md:ml-6 space-x-4">
            {/* Create New Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="hidden sm:flex items-center" size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { window.location.href = "/sms/new" }}>
                  New SMS
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { window.location.href = "/voice/new" }}>
                  New Voice Call
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { window.location.href = "/email/new" }}>
                  New Email
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { window.location.href = "/campaigns/new" }}>
                  New Campaign
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Notifications */}
            <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
              <Bell className="h-5 w-5 text-neutral-400 hover:text-neutral-500" />
              <Badge className="absolute top-0 right-0 h-2 w-2 rounded-full bg-destructive p-0 border-2 border-white" />
            </Button>
            
            {/* Help */}
            <Button variant="ghost" size="icon" aria-label="Help">
              <HelpCircle className="h-5 w-5 text-neutral-400 hover:text-neutral-500" />
            </Button>
            
            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="p-0 bg-transparent h-auto">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-primary-200 flex items-center justify-center text-primary-700">
                      <span className="text-sm font-medium">{getInitials(`${user.firstName} ${user.lastName}`)}</span>
                    </div>
                    <div className="hidden md:block text-left">
                      <span className="text-sm font-medium text-neutral-800">{user.firstName} {user.lastName}</span>
                      <span className="block text-xs text-neutral-500">{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span>
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Link href="/settings/profile">
                    <a className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Link href="/settings">
                    <a className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
