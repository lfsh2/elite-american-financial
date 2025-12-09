import {
  User,
  SmsMessage,
  VoiceCall,
  EmailMessage,
  Campaign,
  Contact,
  BillingTransaction
} from "@shared/schema";

// Auth types
export interface AuthUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  credits: number;
  isSubAccount: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

// Analytics types
export interface DailyActivity {
  date: string;
  sms: number;
  voice: number;
  email: number;
}

export interface DeliveryRates {
  sms: number;
  voice: number;
  email: number;
}

export interface ResponseRates {
  sms: number;
  voice: number;
  email: number;
}

export interface AnalyticsSummary {
  smsSent: number;
  smsGrowth: number;
  voiceMinutes: number;
  voiceGrowth: number;
  emailsDelivered: number;
  emailGrowth: number;
  totalContacts: number;
  contactsGrowth: number;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  dailyActivity: DailyActivity[];
  deliveryRate: DeliveryRates;
  responseRate: ResponseRates;
}

// Recent Activity Types
export interface Activity {
  id: string;
  type: 'sms' | 'voice' | 'email' | 'campaign' | 'user' | 'subaccount';
  title: string;
  description: string;
  timestamp: string;
  icon: string;
}

// Conversation types
export interface Conversation {
  contact: {
    id?: number;
    name: string;
    phoneNumber?: string;
    email?: string;
    avatar?: string;
    initials: string;
  };
  lastMessage: {
    text: string;
    timestamp: string;
  };
}
