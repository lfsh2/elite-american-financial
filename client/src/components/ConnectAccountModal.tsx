import React, { useState } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { TwilioLogo, CommioLogo, BandwidthLogo } from './ProviderLogos';
import { useAccount, ProviderType } from '../contexts/AccountContext';

interface ConnectAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProvider?: ProviderType;
}

type Step = 'select-provider' | 'enter-credentials' | 'success';

interface FormData {
  provider: ProviderType | null;
  name: string;
  accountSid: string;
  authToken: string;
  apiKey: string;
  apiSecret: string;
}

const PROVIDERS = [
  {
    code: 'twilio' as ProviderType,
    name: 'Twilio',
    description: 'Industry-leading cloud communications platform',
    logo: TwilioLogo,
    color: '#F22F46',
    bgColor: '#FEE2E2',
    fields: {
      accountSid: { label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      authToken: { label: 'Auth Token', placeholder: 'Your Twilio Auth Token' },
    },
  },
  {
    code: 'commio' as ProviderType,
    name: 'Commio',
    description: 'Enterprise messaging and voice platform',
    logo: CommioLogo,
    color: '#6366F1',
    bgColor: '#E0E7FF',
    fields: {
      accountSid: { label: 'Account ID', placeholder: 'Your Commio Account ID' },
      authToken: { label: 'API Key', placeholder: 'Your Commio API Key' },
    },
  },
  {
    code: 'bandwidth' as ProviderType,
    name: 'Bandwidth',
    description: 'Communications APIs for voice, messaging & 911',
    logo: BandwidthLogo,
    color: '#079CEE',
    bgColor: '#DBEAFE',
    fields: {
      accountSid: { label: 'Account ID', placeholder: 'Your Bandwidth Account ID' },
      authToken: { label: 'API Token', placeholder: 'Your Bandwidth API Token' },
    },
  },
];

export default function ConnectAccountModal({ isOpen, onClose, initialProvider }: ConnectAccountModalProps) {
  const { refreshAccounts } = useAccount();
  const [step, setStep] = useState<Step>(initialProvider ? 'enter-credentials' : 'select-provider');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthToken, setShowAuthToken] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    provider: initialProvider || null,
    name: '',
    accountSid: '',
    authToken: '',
    apiKey: '',
    apiSecret: '',
  });

  const selectedProvider = PROVIDERS.find(p => p.code === formData.provider);

  const handleProviderSelect = (provider: ProviderType) => {
    setFormData(prev => ({ ...prev, provider }));
    setStep('enter-credentials');
    setError(null);
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.provider || !formData.accountSid || !formData.authToken) {
      setError('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerCode: formData.provider,
          name: formData.name || `${selectedProvider?.name} Account`,
          type: 'master',
          accountSid: formData.accountSid,
          authToken: formData.authToken,
          apiKey: formData.apiKey || undefined,
          apiSecret: formData.apiSecret || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to connect account');
      }

      setStep('success');
      await refreshAccounts();
      
      // Auto-close after success
      setTimeout(() => {
        onClose();
        resetForm();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      provider: null,
      name: '',
      accountSid: '',
      authToken: '',
      apiKey: '',
      apiSecret: '',
    });
    setStep('select-provider');
    setError(null);
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'select-provider' && 'Connect Account'}
            {step === 'enter-credentials' && `Connect ${selectedProvider?.name}`}
            {step === 'success' && 'Account Connected'}
          </h2>
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Select Provider */}
          {step === 'select-provider' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                Choose a communication provider to connect to your workspace.
              </p>
              
              {PROVIDERS.map(provider => {
                const Logo = provider.logo;
                return (
                  <button
                    key={provider.code}
                    onClick={() => handleProviderSelect(provider.code)}
                    className="w-full flex items-center p-4 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all group"
                  >
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center mr-4"
                      style={{ backgroundColor: provider.bgColor }}
                    >
                      <Logo className="w-7 h-7" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900">{provider.name}</div>
                      <div className="text-sm text-gray-500">{provider.description}</div>
                    </div>
                    <div className="text-gray-400 group-hover:text-gray-600">
                      →
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Enter Credentials */}
          {step === 'enter-credentials' && selectedProvider && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Provider Badge */}
              <div 
                className="flex items-center p-3 rounded-lg mb-4"
                style={{ backgroundColor: selectedProvider.bgColor }}
              >
                <selectedProvider.logo className="w-6 h-6 mr-3" />
                <span className="font-medium" style={{ color: selectedProvider.color }}>
                  {selectedProvider.name}
                </span>
                <button
                  type="button"
                  onClick={() => setStep('select-provider')}
                  className="ml-auto text-sm text-gray-600 hover:text-gray-900"
                >
                  Change
                </button>
              </div>

              {/* Account Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder={`My ${selectedProvider.name} Account`}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Account SID / ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedProvider.fields.accountSid.label} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.accountSid}
                  onChange={(e) => handleInputChange('accountSid', e.target.value)}
                  placeholder={selectedProvider.fields.accountSid.placeholder}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  required
                />
              </div>

              {/* Auth Token */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedProvider.fields.authToken.label} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAuthToken ? 'text' : 'password'}
                    value={formData.authToken}
                    onChange={(e) => handleInputChange('authToken', e.target.value)}
                    placeholder={selectedProvider.fields.authToken.placeholder}
                    className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthToken(!showAuthToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showAuthToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Help Text */}
              <p className="text-xs text-gray-500">
                Your credentials are encrypted and stored securely. We only use them to access your {selectedProvider.name} account on your behalf.
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('select-provider')}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Account'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Account Connected Successfully!
              </h3>
              <p className="text-gray-600">
                Your {selectedProvider?.name} account has been connected and is ready to use.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
