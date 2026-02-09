import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '../components/ui/use-toast';

interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  credits: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (userData: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      // This is a simplified version that doesn't actually call an API
      // In a real app, you would make an API call to verify the token
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Failed to parse stored user', e);
          localStorage.removeItem('user');
        }
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Call the actual login API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // Store the user in localStorage
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('isAuthenticated', 'true');
        
        setUser(userData);
        setLocation('/dashboard');
        
        toast({
          title: 'Login successful',
          description: `Welcome back, ${userData.firstName}!`,
        });
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Invalid username or password');
        toast({
          title: 'Login failed',
          description: errorData.message || 'Invalid username or password',
          variant: 'destructive',
        });
      }
    } catch (err) {
      setError('Failed to login. Please try again.');
      toast({
        title: 'Login failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Clear user from localStorage
      localStorage.removeItem('user');
      localStorage.setItem('isAuthenticated', 'false');
      
      // Clear user from state
      setUser(null);
      setLocation('/');
      
      toast({
        title: 'Logout successful',
        description: 'You have been logged out successfully.',
      });
    } catch (err) {
      setError('Failed to logout. Please try again.');
      toast({
        title: 'Logout failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: any) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // For demo purposes, we'll just simulate a registration
      // Create a mock user
      const mockUser = {
        id: 1,
        username: userData.username,
        firstName: userData.firstName || 'New',
        lastName: userData.lastName || 'User',
        email: userData.email,
        role: 'user',
        credits: 100,
      };
      
      // Store the user in localStorage
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('isAuthenticated', 'true');
      
      setUser(mockUser);
      setLocation('/dashboard');
      
      toast({
        title: 'Registration successful',
        description: 'Your account has been created successfully.',
      });
    } catch (err) {
      setError('Failed to register. Please try again.');
      toast({
        title: 'Registration failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}