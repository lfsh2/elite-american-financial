import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useAccount } from '../contexts/AccountContext';
import { ProviderLogo } from '../components/shared/ProviderLogo';
import {
  User,
  Lock,
  Bell,
  Shield,
  Key,
  RefreshCw,
  Plug,
  CheckCircle,
  XCircle,
  Settings as SettingsIcon,
  Unlink,
  TestTube,
  Zap,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Plus,
  LinkIcon,
  Building2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '../components/ui/use-toast';

interface ProviderCredentials {
  id: string;
  provider: 'twilio' | 'commio' | 'bandwidth';
  name: string;
  accountSid?: string;
  authToken?: string;
  apiUsername?: string;
  apiPassword?: string;
  accountId?: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  isActive: boolean;
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { accounts, refreshAccounts } = useAccount();
  
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'twilio' | 'commio' | 'bandwidth'>('twilio');
  const [testingConnection, setTestingConnection] = useState(false);

  // Profile state
  const [profile, setProfile] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: '',
    company: '',
  });

  // Password state
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Notification settings
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    smsNotifications: false,
    lowBalanceAlert: true,
    newMessageAlert: true,
  });

  // Provider credentials state - derived from accounts context
  const [providers, setProviders] = useState<ProviderCredentials[]>([]);

  // Sync providers from accounts context
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const mappedProviders: ProviderCredentials[] = accounts.map(acc => ({
        id: acc.id,
        provider: acc.provider as 'twilio' | 'commio' | 'bandwidth',
        name: acc.name,
        accountSid: acc.accountSid ? `${acc.accountSid.substring(0, 4)}${'*'.repeat(16)}` : undefined,
        status: acc.status === 'active' ? 'connected' : 'disconnected',
        lastSync: acc.lastSyncAt || new Date().toISOString(),
        isActive: acc.status === 'active'
      }));
      setProviders(mappedProviders);
    }
  }, [accounts]);

  // New provider form
  const [newProvider, setNewProvider] = useState({
    name: '',
    accountSid: '',
    authToken: '',
    apiUsername: '',
    apiPassword: '',
    accountId: ''
  });

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      // API call to save profile
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update profile.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match.',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      // API call to change password
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: 'Password Changed',
        description: 'Your password has been changed successfully.',
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to change password.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      // Simulate API test
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast({
        title: 'Connection Successful',
        description: `Successfully connected to ${selectedProvider.toUpperCase()} API.`,
      });
      return true;
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect. Please check your credentials.',
        variant: 'destructive'
      });
      return false;
    } finally {
      setTestingConnection(false);
    }
  };

  const handleConnectProvider = async () => {
    setIsLoading(true);
    try {
      // Map fields based on provider
      let accountSid: string;
      let authToken: string;
      let apiKey: string | undefined;

      if (selectedProvider === 'twilio') {
        accountSid = newProvider.accountSid;
        authToken = newProvider.authToken;
      } else if (selectedProvider === 'commio') {
        // Commio: accountId -> accountSid, apiPassword (token) -> authToken
        accountSid = newProvider.accountId;
        authToken = newProvider.apiPassword;
      } else if (selectedProvider === 'bandwidth') {
        // Bandwidth: accountId -> accountSid, apiPassword -> authToken, apiUsername -> apiKey
        accountSid = newProvider.accountId;
        authToken = newProvider.apiPassword;
        apiKey = newProvider.apiUsername;
      } else {
        // Other providers
        accountSid = newProvider.accountId || newProvider.accountSid;
        authToken = newProvider.authToken || newProvider.apiPassword;
      }

      if (!accountSid || !authToken) {
        toast({
          title: 'Missing Credentials',
          description: 'Please fill in all required fields.',
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerCode: selectedProvider,
          name: newProvider.name || `${selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} Account`,
          type: 'master',
          accountSid,
          authToken,
          apiKey,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to connect account');
      }

      // Close modal and reset form
      setConnectModalOpen(false);
      setNewProvider({
        name: '',
        accountSid: '',
        authToken: '',
        apiUsername: '',
        apiPassword: '',
        accountId: ''
      });

      toast({
        title: 'Provider Connected',
        description: `${selectedProvider.toUpperCase()} has been connected successfully.`,
      });

      // Refresh accounts - useEffect will sync providers from accounts context
      await refreshAccounts();
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect provider.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectProvider = async (providerId: string) => {
    try {
      const response = await fetch(`/api/accounts/${providerId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to disconnect provider');
      }
      
      toast({
        title: 'Provider Disconnected',
        description: 'Provider has been disconnected.',
      });
      
      // Refresh accounts - useEffect will sync providers
      await refreshAccounts();
    } catch (error) {
      toast({
        title: 'Disconnect Failed',
        description: error instanceof Error ? error.message : 'Failed to disconnect provider.',
        variant: 'destructive'
      });
    }
  };

  const handleSyncProvider = async (providerId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/accounts/${providerId}/sync`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to sync provider');
      }
      
      toast({
        title: 'Sync Complete',
        description: 'Provider data has been synced successfully.',
      });
      
      // Refresh accounts to get updated data
      await refreshAccounts();
    } catch (error) {
      toast({
        title: 'Sync Failed',
        description: 'Failed to sync provider data.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getProviderLogo = (provider: string) => {
    return <ProviderLogo provider={provider as any} size="lg" />;
  };

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="providers">API Providers</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={profile.firstName}
                    onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={profile.lastName}
                    onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={profile.company}
                  onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={passwords.currentPassword}
                    onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                />
              </div>
              <Button onClick={handleChangePassword} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Change Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Providers Tab */}
        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Connected Providers</CardTitle>
                  <CardDescription>Manage your Twilio, Commio, and other API integrations</CardDescription>
                </div>
                <Dialog open={connectModalOpen} onOpenChange={setConnectModalOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Connect Provider
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                      <DialogTitle>Connect API Provider</DialogTitle>
                      <DialogDescription>
                        Add a new communication provider to fetch data from multiple sources
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Provider</Label>
                        <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as any)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="twilio">
                              <div className="flex items-center gap-2">
                                <span>🔵</span>
                                <span>Twilio</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="commio">
                              <div className="flex items-center gap-2">
                                <span>🟢</span>
                                <span>Commio</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="bandwidth">
                              <div className="flex items-center gap-2">
                                <span>🟣</span>
                                <span>Bandwidth</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="providerName">Account Name</Label>
                        <Input
                          id="providerName"
                          placeholder="e.g., Main Twilio Account"
                          value={newProvider.name}
                          onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                        />
                      </div>

                      {selectedProvider === 'twilio' && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="accountSid">Account SID</Label>
                            <Input
                              id="accountSid"
                              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                              value={newProvider.accountSid}
                              onChange={(e) => setNewProvider({ ...newProvider, accountSid: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="authToken">Auth Token</Label>
                            <Input
                              id="authToken"
                              type="password"
                              placeholder="Your Twilio Auth Token"
                              value={newProvider.authToken}
                              onChange={(e) => setNewProvider({ ...newProvider, authToken: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      {selectedProvider === 'commio' && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="accountId">Account ID <span className="text-red-500">*</span></Label>
                            <Input
                              id="accountId"
                              placeholder="e.g., 22956"
                              value={newProvider.accountId}
                              onChange={(e) => setNewProvider({ ...newProvider, accountId: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">Found in Dashboard → API → Tokens</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="apiPassword">API Token <span className="text-red-500">*</span></Label>
                            <Input
                              id="apiPassword"
                              type="password"
                              placeholder="Your Commio API Token"
                              value={newProvider.apiPassword}
                              onChange={(e) => setNewProvider({ ...newProvider, apiPassword: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">Click on your token name to view/copy the token value</p>
                          </div>
                        </>
                      )}

                      {selectedProvider === 'bandwidth' && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="accountId">Account ID <span className="text-red-500">*</span></Label>
                            <Input
                              id="accountId"
                              placeholder="Your Bandwidth Account ID"
                              value={newProvider.accountId}
                              onChange={(e) => setNewProvider({ ...newProvider, accountId: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="apiUsername">API Username <span className="text-red-500">*</span></Label>
                            <Input
                              id="apiUsername"
                              placeholder="Your Bandwidth API Username"
                              value={newProvider.apiUsername}
                              onChange={(e) => setNewProvider({ ...newProvider, apiUsername: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="apiPassword">API Password <span className="text-red-500">*</span></Label>
                            <Input
                              id="apiPassword"
                              type="password"
                              placeholder="Your Bandwidth API Password"
                              value={newProvider.apiPassword}
                              onChange={(e) => setNewProvider({ ...newProvider, apiPassword: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setConnectModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleTestConnection} variant="secondary" disabled={testingConnection}>
                        {testingConnection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                        Test Connection
                      </Button>
                      <Button onClick={handleConnectProvider} disabled={testingConnection}>
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Connect
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {providers.map((provider) => (
                  <Card key={provider.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-4xl">{getProviderLogo(provider.provider)}</div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold capitalize">{provider.provider}</h3>
                              {provider.status === 'connected' ? (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                  Connected
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Disconnected
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{provider.name}</p>
                            {provider.accountSid && (
                              <p className="text-xs text-muted-foreground font-mono mt-1">
                                {provider.accountSid}
                              </p>
                            )}
                            {provider.lastSync && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Last synced: {new Date(provider.lastSync).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncProvider(provider.id)}
                            disabled={isLoading}
                            title="Sync data"
                          >
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to disconnect ${provider.name}? This will remove the API connection.`)) {
                                handleDisconnectProvider(provider.id);
                              }
                            }}
                            title="Disconnect provider"
                          >
                            <Unlink className="h-4 w-4 mr-1" />
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {providers.length === 0 && (
                  <div className="text-center py-12">
                    <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No Providers Connected</h3>
                    <p className="text-muted-foreground mt-2">
                      Connect Twilio, Commio, or other providers to start fetching data
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Manage how you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                </div>
                <Switch
                  checked={notifications.emailNotifications}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, emailNotifications: checked })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive notifications via SMS</p>
                </div>
                <Switch
                  checked={notifications.smsNotifications}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, smsNotifications: checked })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Low Balance Alerts</Label>
                  <p className="text-sm text-muted-foreground">Get notified when balance is low</p>
                </div>
                <Switch
                  checked={notifications.lowBalanceAlert}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, lowBalanceAlert: checked })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Message Alerts</Label>
                  <p className="text-sm text-muted-foreground">Get notified of new messages</p>
                </div>
                <Switch
                  checked={notifications.newMessageAlert}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, newMessageAlert: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
