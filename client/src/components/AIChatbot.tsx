import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageCircle, 
  X, 
  Send, 
  Loader2, 
  Bot, 
  User,
  Sparkles,
  TrendingUp,
  Users,
  Calendar,
  BarChart3,
  Truck,
  Package,
  MessageSquare,
  Activity,
  Zap,
  Phone,
  Mail,
  Target,
  TrendingDown,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MetricCard {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: React.ReactNode;
}

const suggestedQuestions = [
  { icon: <MessageSquare className="w-4 h-4" />, text: "Show me today's SMS campaign performance" },
  { icon: <AlertCircle className="w-4 h-4" />, text: "Why are my batch messages failing?" },
  { icon: <Activity className="w-4 h-4" />, text: "Which phone numbers have the lowest health?" },
  { icon: <Target className="w-4 h-4" />, text: "What's my delivery rate across providers?" },
  { icon: <TrendingUp className="w-4 h-4" />, text: "Analyze my message failure patterns" },
  { icon: <BarChart3 className="w-4 h-4" />, text: "Show phone number health scores" },
];

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "👋 Hi! I'm your SoftLink iQ Business Intelligence Assistant.\n\nI have access to real-time data on:\n• SMS campaign performance & delivery rates\n• Twilio & Commio provider metrics\n• Message volume & engagement analytics\n• Logistics operations & tracking\n• A2P compliance & campaign status\n\nAsk about leads, campaigns, or logistics insights!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [metrics, setMetrics] = useState<MetricCard[]>([
    {
      label: 'Messages Today',
      value: '12.4K',
      change: '+12.5%',
      trend: 'up',
      icon: <MessageSquare className="w-4 h-4" />
    },
    {
      label: 'Delivery Rate',
      value: '98.2%',
      change: '+2.1%',
      trend: 'up',
      icon: <CheckCircle2 className="w-4 h-4" />
    },
    {
      label: 'Active Campaigns',
      value: '8',
      change: '+2',
      trend: 'up',
      icon: <Target className="w-4 h-4" />
    },
    {
      label: 'Avg Response',
      value: '2.3m',
      change: '-0.5m',
      trend: 'up',
      icon: <Clock className="w-4 h-4" />
    }
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      fetchMetrics();
    }
  }, [isOpen]);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/analytics/summary', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setMetrics([
          {
            label: 'Messages Today',
            value: data.messagesToday || '0',
            change: data.messagesChange || '0%',
            trend: data.messagesTrend || 'up',
            icon: <MessageSquare className="w-4 h-4" />
          },
          {
            label: 'Delivery Rate',
            value: data.deliveryRate || '0%',
            change: data.deliveryChange || '0%',
            trend: data.deliveryTrend || 'up',
            icon: <CheckCircle2 className="w-4 h-4" />
          },
          {
            label: 'Active Campaigns',
            value: data.activeCampaigns || '0',
            change: data.campaignsChange || '0',
            trend: 'up',
            icon: <Target className="w-4 h-4" />
          },
          {
            label: 'Avg Response',
            value: data.avgResponse || '0m',
            change: data.responseChange || '0m',
            trend: 'up',
            icon: <Clock className="w-4 h-4" />
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || "I'm sorry, I couldn't process that request.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 z-50 ${
          isOpen 
            ? 'bg-gray-700 hover:bg-gray-800' 
            : 'bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 hover:from-purple-700 hover:via-blue-700 hover:to-cyan-600 animate-pulse'
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <div className="relative">
            <Sparkles className="w-7 h-7 text-white" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
          </div>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[420px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 border border-gray-200 animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 p-5 flex items-center space-x-3 relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]"></div>
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center relative z-10 shadow-lg">
              <Zap className="w-7 h-7 text-yellow-300" />
            </div>
            <div className="relative z-10">
              <h3 className="text-white font-bold text-lg">SoftLink iQ AI</h3>
              <p className="text-purple-100 text-sm flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Logistics Intelligence
              </p>
            </div>
            <div className="ml-auto relative z-10">
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-xs text-white font-medium">Live</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          {showMetrics && messages.length <= 2 && (
            <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Today's Overview</h4>
                <button 
                  onClick={() => setShowMetrics(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {metrics.map((metric, index) => (
                  <div 
                    key={index}
                    className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-100 hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-purple-600">{metric.icon}</div>
                      <span className={`text-xs font-medium ${
                        metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {metric.change}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-gray-900">{metric.value}</div>
                    <div className="text-[10px] text-gray-500 leading-tight">{metric.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white scrollbar-thin scrollbar-thumb-purple-300 scrollbar-track-gray-100 hover:scrollbar-thumb-purple-400">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-br-md shadow-lg'
                      : 'bg-white text-gray-800 shadow-md border border-gray-200 rounded-bl-md hover:shadow-lg transition-shadow'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-5 h-5 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                        <Zap className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent font-bold">SoftLink iQ</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-purple-200' : 'text-gray-400'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-md border border-gray-200">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                      <div className="absolute inset-0 w-5 h-5 bg-purple-400 rounded-full animate-ping opacity-20"></div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-700 font-medium">Analyzing data...</span>
                      <div className="flex gap-1 mt-1">
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Questions (show only if few messages) */}
          {messages.length <= 2 && !isLoading && (
            <div className="px-4 py-3 bg-gradient-to-br from-purple-50/50 to-blue-50/50 border-t border-gray-200 flex-shrink-0 max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-purple-200 scrollbar-track-transparent">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Quick Insights</p>
              </div>
              <div className="flex flex-col gap-2">
                {suggestedQuestions.map((q, index) => (
                  <button
                    key={index}
                    onClick={() => sendMessage(q.text)}
                    className="flex items-center space-x-2.5 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 hover:border-purple-300 hover:text-purple-700 transition-all shadow-sm hover:shadow-md hover:scale-[1.01] w-full text-left"
                  >
                    <div className="text-purple-600 flex-shrink-0">{q.icon}</div>
                    <span className="font-medium flex-1">{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="px-4 py-2 bg-white border-t border-gray-100 flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent pb-1">
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 transition-all hover:scale-105 whitespace-nowrap shadow-sm">
                <Phone className="w-3 h-3" />
                Twilio Status
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-all hover:scale-105 whitespace-nowrap shadow-sm">
                <MessageSquare className="w-3 h-3" />
                Commio Metrics
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-all hover:scale-105 whitespace-nowrap shadow-sm">
                <Target className="w-3 h-3" />
                Campaigns
              </button>
            </div>
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about campaigns, logistics, analytics..."
                className="flex-1 px-4 py-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all border border-gray-200 placeholder:text-gray-400"
                disabled={isLoading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="w-11 h-11 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center text-white hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl active:scale-95 flex-shrink-0"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
