import React, { ReactNode, memo } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import AIChatbot from '../AIChatbot';

interface LayoutProps {
  children: ReactNode;
}

// Memoized to prevent unnecessary re-renders
const Layout = memo(function Layout({ children }: LayoutProps) {
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

export default Layout;
