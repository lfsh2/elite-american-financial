import React, { useState } from 'react';
import { 
  X, 
  Loader2, 
  Building2, 
  Users, 
  Phone,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react';
import { useAccount, type Account } from '../contexts/AccountContext';
import { useToast } from './ui/use-toast';

interface SubAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentAccount: Account;
  onSuccess?: (newAccount: any) => void;
}

export function SubAccountModal({ 
  isOpen, 
  onClose, 
  parentAccount,
  onSuccess 
}: SubAccountModalProps) {
  const { toast } = useToast();
  const { refreshAccounts } = useAccount();
  
  const [friendlyName, setFriendlyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!friendlyName.trim()) {
      setError('Please enter a name for the sub-account');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/accounts/${parentAccount.id}/subaccounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendlyName: friendlyName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create sub-account');
      }

      toast({
        title: 'Sub-account created',
        description: `"${friendlyName}" has been created successfully.`,
      });

      // Refresh accounts list
      await refreshAccounts();
      
      // Call success callback
      onSuccess?.(data.account);
      
      // Reset and close
      setFriendlyName('');
      onClose();
    } catch (err: any) {
      console.error('Error creating sub-account:', err);
      setError(err.message || 'Failed to create sub-account');
      toast({
        title: 'Error',
        description: err.message || 'Failed to create sub-account',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-white">
              <Building2 className="w-5 h-5 mr-2" />
              <h2 className="text-lg font-semibold">Create Sub-Account</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <Info className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">What is a Sub-Account?</p>
                <p className="text-blue-600">
                  Sub-accounts allow you to organize communications by client, department, 
                  or project. Each sub-account has its own phone numbers, usage tracking, 
                  and can be managed independently.
                </p>
              </div>
            </div>
          </div>

          {/* Parent Account Info */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parent Account
            </label>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-3">
                  <Building2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{parentAccount.name}</div>
                  <div className="text-sm text-gray-500">
                    {parentAccount.phoneNumberCount} phone numbers
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Account Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sub-Account Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={friendlyName}
              onChange={(e) => {
                setFriendlyName(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Client ABC, Marketing Team, Support"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={isCreating}
            />
            <p className="mt-2 text-sm text-gray-500">
              Choose a descriptive name to easily identify this sub-account.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center text-red-700">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {/* Features List */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Sub-Account Features
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                Separate phone numbers
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                Independent usage tracking
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                Isolated billing
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                Can be suspended/closed
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !friendlyName.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4 mr-2" />
                Create Sub-Account
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubAccountModal;
