import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Building2,
  FileText,
  Phone,
  MessageSquare,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Zap
} from 'lucide-react';

interface BrandRegistration {
  id: string;
  brandName: string;
  companyName: string;
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  identityStatus?: string;
  brandScore?: number;
  dateCreated: string;
  dateUpdated: string;
  twilioData?: any;
}

interface CampaignRegistration {
  id: string;
  campaignName: string;
  useCase: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  brandRegistrationSid?: string;
  messagingServiceSid?: string;
  messagingServiceName?: string;
  hasEmbeddedLinks?: boolean;
  hasEmbeddedPhone?: boolean;
  messageFlow?: string;
  optInMessage?: string;
  optOutMessage?: string;
  helpMessage?: string;
  dateCreated: string;
  dateUpdated: string;
}

interface MessagingService {
  sid: string;
  friendlyName: string;
  usecase?: string;
  dateCreated?: string;
  dateUpdated?: string;
}

export default function Compliance() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'brand' | 'campaigns' | 'numbers'>('overview');
  // Real data from Twilio
  const [brands, setBrands] = useState<BrandRegistration[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRegistration[]>([]);
  const [messagingServices, setMessagingServices] = useState<MessagingService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Auto-sync disabled - user can manually sync with button
  // useEffect(() => {
  //   syncFromTwilio();
  // }, []);

  const syncFromTwilio = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/compliance/a2p/sync', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        // Map brands - handle both array and object with items
        const brandItems = Array.isArray(data.brands) ? data.brands : (data.brands?.items || []);
        const mappedBrands: BrandRegistration[] = brandItems.map((b: any) => ({
          id: b.id || b.externalId,
          brandName: b.companyName || 'Brand Registration',
          companyName: b.companyName || 'Unknown',
          status: b.status || 'pending',
          identityStatus: b.identityStatus,
          brandScore: b.brandScore,
          dateCreated: b.dateCreated,
          dateUpdated: b.dateUpdated,
          twilioData: b.twilioData
        }));
        setBrands(mappedBrands);

        // Map campaigns - handle both array and object with items
        const campaignItems = Array.isArray(data.campaigns) ? data.campaigns : (data.campaigns?.items || []);
        const mappedCampaigns: CampaignRegistration[] = campaignItems.map((c: any) => ({
          id: c.id || c.externalId,
          campaignName: c.campaignName || 'Campaign',
          useCase: c.useCase || 'MIXED',
          description: c.description || '',
          status: c.status || 'pending',
          brandRegistrationSid: c.brandRegistrationSid,
          messagingServiceSid: c.messagingServiceSid,
          messagingServiceName: c.messagingServiceName,
          hasEmbeddedLinks: c.hasEmbeddedLinks,
          hasEmbeddedPhone: c.hasEmbeddedPhone,
          messageFlow: c.messageFlow,
          optInMessage: c.optInMessage,
          optOutMessage: c.optOutMessage,
          helpMessage: c.helpMessage,
          dateCreated: c.dateCreated,
          dateUpdated: c.dateUpdated
        }));
        setCampaigns(mappedCampaigns);

        // Set messaging services - handle both array and object with items
        const serviceItems = Array.isArray(data.messagingServices) ? data.messagingServices : (data.messagingServices?.items || []);
        setMessagingServices(serviceItems);

        const brandCount = data.brands?.synced || brandItems.length;
        const campaignCount = data.campaigns?.synced || campaignItems.length;
        const serviceCount = data.messagingServices?.synced || serviceItems.length;

        toast({
          title: 'Synced from Twilio',
          description: `${brandCount} brands, ${campaignCount} campaigns, ${serviceCount} messaging services`
        });
      } else {
        // Handle non-success response
        toast({
          title: 'Sync completed',
          description: data.message || 'Data synced from Twilio',
        });
      }
    } catch (error) {
      console.error('Error syncing from Twilio:', error);
      toast({
        title: 'Sync failed',
        description: 'Could not sync A2P data from Twilio',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  // Use case labels for display
  const useCaseLabels: Record<string, string> = {
    '2FA': '2FA / Authentication',
    'ACCOUNT_NOTIFICATION': 'Account Notifications',
    'CUSTOMER_CARE': 'Customer Care',
    'DELIVERY_NOTIFICATION': 'Delivery Notifications',
    'FRAUD_ALERT': 'Fraud Alerts',
    'HIGHER_EDUCATION': 'Higher Education',
    'LOW_VOLUME': 'Low Volume Mixed',
    'MARKETING': 'Marketing',
    'POLLING_VOTING': 'Polling & Voting',
    'PUBLIC_SERVICE': 'Public Service',
    'MIXED': 'Mixed Use Case',
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Pending Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <FileText className="w-3 h-3 mr-1" />
            Draft
          </span>
        );
      default:
        return null;
    }
  };

  const approvedBrand = brands.find(b => b.status === 'approved');
  const approvedCampaigns = campaigns.filter(c => c.status === 'approved');

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-500">Loading A2P compliance data from Twilio...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Compliance & A2P 10DLC</h1>
          <p className="text-gray-500">Your A2P 10DLC registrations synced from Twilio</p>
        </div>
        <button
          onClick={syncFromTwilio}
          disabled={isSyncing}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Sync from Twilio
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('brand')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'brand'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Brand Registration
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'campaigns'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Campaign Registration
          </button>
          <button
            onClick={() => setActiveTab('numbers')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'numbers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Messaging Services
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Brand Status</h3>
                {approvedBrand ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Registered
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Not Registered
                  </span>
                )}
              </div>
              {approvedBrand ? (
                <div>
                  <p className="text-2xl font-bold text-gray-900">{approvedBrand.brandName}</p>
                  <p className="text-sm text-gray-500 mt-1">Brand SID: {approvedBrand.id}</p>
                  {approvedBrand.identityStatus && (
                    <p className="text-xs text-green-600 mt-1">Identity: {approvedBrand.identityStatus}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Register your brand to start sending A2P messages</p>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Active Campaigns</h3>
                <span className="text-2xl font-bold text-blue-600">{approvedCampaigns.length}</span>
              </div>
              <p className="text-sm text-gray-500">
                {campaigns.filter(c => c.status === 'pending').length} pending review
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Compliance Score</h3>
                <span className="text-2xl font-bold text-green-600">
                  {approvedBrand && approvedCampaigns.length > 0 ? '100%' : '0%'}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {approvedBrand && approvedCampaigns.length > 0 
                  ? 'Fully compliant for A2P messaging'
                  : 'Complete registration to become compliant'}
              </p>
            </div>
          </div>

          {/* What is A2P 10DLC */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <Info className="w-5 h-5 mr-2 text-blue-500" />
              What is A2P 10DLC?
            </h3>
            <p className="text-gray-600 mb-4">
              A2P 10DLC (Application-to-Person 10-Digit Long Code) is a system that allows businesses to send 
              SMS messages using standard 10-digit phone numbers while maintaining compliance with carrier 
              requirements. Registration is required by all major US carriers.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="ml-3">
                  <h4 className="font-medium text-gray-900">1. Register Brand</h4>
                  <p className="text-sm text-gray-500">Verify your business identity</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
                <div className="ml-3">
                  <h4 className="font-medium text-gray-900">2. Register Campaigns</h4>
                  <p className="text-sm text-gray-500">Define your messaging use cases</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600" />
                </div>
                <div className="ml-3">
                  <h4 className="font-medium text-gray-900">3. Assign Numbers</h4>
                  <p className="text-sm text-gray-500">Link phone numbers to campaigns</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          {!approvedBrand && (
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg p-6 text-white">
              <h3 className="text-lg font-medium mb-2">Get Started with A2P 10DLC</h3>
              <p className="text-blue-100 mb-4">
                Register your brand in Twilio Console to unlock higher messaging throughput and better deliverability.
              </p>
              <a
                href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-blue-600 px-4 py-2 rounded-md font-medium hover:bg-blue-50 inline-flex items-center"
              >
                Open Twilio Console
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Brand Registration Tab */}
      {activeTab === 'brand' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Brand Registrations</h3>
            <a
              href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Manage in Twilio
              <ExternalLink className="w-3 h-3 ml-2" />
            </a>
          </div>

          {brands.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 divide-y">
              {brands.map((brand) => (
                <div key={brand.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{brand.brandName}</h4>
                        {getStatusBadge(brand.status)}
                        {brand.identityStatus && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                            {brand.identityStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Brand SID: {brand.id}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        {brand.dateCreated && (
                          <span>Created: {new Date(brand.dateCreated).toLocaleDateString()}</span>
                        )}
                        {brand.dateUpdated && (
                          <span>Updated: {new Date(brand.dateUpdated).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <a 
                      href={`https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc/brands/${brand.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Brand Registered</h3>
              <p className="text-gray-500 mb-4">Register your brand in Twilio Console to start the A2P 10DLC process</p>
              <a
                href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Open Twilio Console
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Campaign Registration Tab */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Campaign Registrations</h3>
            <a
              href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Manage in Twilio
              <ExternalLink className="w-3 h-3 ml-2" />
            </a>
          </div>

          {!approvedBrand && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="ml-3">
                <h4 className="text-sm font-medium text-yellow-800">Brand Registration Required</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  You must have an approved brand registration before you can register campaigns.
                </p>
              </div>
            </div>
          )}

          {campaigns.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 divide-y">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 flex-wrap gap-2">
                        <h4 className="font-medium text-gray-900">{campaign.campaignName}</h4>
                        {getStatusBadge(campaign.status)}
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                          {useCaseLabels[campaign.useCase] || campaign.useCase}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{campaign.description}</p>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                        <span>Campaign SID: {campaign.id}</span>
                        {campaign.messagingServiceName && (
                          <span>Service: {campaign.messagingServiceName}</span>
                        )}
                      </div>
                      {campaign.optInMessage && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                          <strong>Opt-In:</strong> {campaign.optInMessage}
                        </div>
                      )}
                    </div>
                    <ExternalLink className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Campaigns Registered</h3>
              <p className="text-gray-500 mb-4">
                {approvedBrand 
                  ? 'Register a campaign to define your messaging use case'
                  : 'Register your brand first, then create campaigns'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Messaging Services Tab */}
      {activeTab === 'numbers' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Messaging Services</h3>
            <span className="text-sm text-gray-500">{messagingServices.length} services from Twilio</span>
          </div>

          {messagingServices.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 divide-y">
              {messagingServices.map((service) => (
                <div key={service.sid} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <Zap className="w-5 h-5 text-purple-500" />
                        <h4 className="font-medium text-gray-900">{service.friendlyName}</h4>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">SID: {service.sid}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        {service.usecase && (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                            {service.usecase}
                          </span>
                        )}
                        {service.dateCreated && (
                          <span>Created: {new Date(service.dateCreated).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <a 
                      href={`https://console.twilio.com/us1/develop/sms/services/${service.sid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center"
                    >
                      View in Twilio
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Messaging Services</h3>
              <p className="text-gray-500 mb-4">
                Create a Messaging Service in Twilio to manage your A2P campaigns
              </p>
              <a 
                href="https://console.twilio.com/us1/develop/sms/services"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-blue-600 hover:text-blue-700"
              >
                Go to Twilio Console
                <ExternalLink className="w-4 h-4 ml-1" />
              </a>
            </div>
          )}
        </div>
      )}

    </div>
  );
}