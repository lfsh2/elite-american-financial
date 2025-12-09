import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Building2,
  FileText,
  Phone,
  MessageSquare,
  ChevronRight,
  ExternalLink,
  Info,
  HelpCircle,
  ArrowRight,
  Loader2,
  Check,
  X
} from 'lucide-react';

interface BrandRegistration {
  id: number;
  brandName: string;
  companyName: string;
  ein: string;
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  submittedAt: string | null;
  approvedAt: string | null;
  brandId: string | null;
}

interface CampaignRegistration {
  id: number;
  campaignName: string;
  useCase: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  brandId: number;
  submittedAt: string | null;
  approvedAt: string | null;
  campaignId: string | null;
  sampleMessages: string[];
}

export default function Compliance() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'brand' | 'campaigns' | 'numbers'>('overview');
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Brand registration form
  const [brandForm, setBrandForm] = useState({
    brandName: '',
    companyName: '',
    ein: '',
    website: '',
    vertical: '',
    stockSymbol: '',
    stockExchange: '',
    companyType: 'private',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    contactName: '',
    contactEmail: '',
    contactPhone: ''
  });

  // Campaign registration form
  const [campaignForm, setCampaignForm] = useState({
    campaignName: '',
    useCase: '',
    description: '',
    sampleMessage1: '',
    sampleMessage2: '',
    messageFlow: '',
    optInKeywords: 'START, YES',
    optOutKeywords: 'STOP, UNSUBSCRIBE',
    helpKeywords: 'HELP, INFO',
    optInMessage: '',
    optOutMessage: '',
    helpMessage: '',
    embeddedLinks: false,
    embeddedPhone: false,
    ageGated: false,
    directLending: false
  });

  // Mock brand registrations
  const [brands, setBrands] = useState<BrandRegistration[]>([
    {
      id: 1,
      brandName: 'SyncGrid Main',
      companyName: 'SyncGrid Inc.',
      ein: '12-3456789',
      status: 'approved',
      submittedAt: '2024-06-01T10:00:00Z',
      approvedAt: '2024-06-05T14:30:00Z',
      brandId: 'BRAND_ABC123'
    }
  ]);

  // Mock campaign registrations
  const [campaigns, setCampaigns] = useState<CampaignRegistration[]>([
    {
      id: 1,
      campaignName: 'Marketing Notifications',
      useCase: 'Marketing',
      description: 'Promotional messages and offers to opted-in customers',
      status: 'approved',
      brandId: 1,
      submittedAt: '2024-06-10T09:00:00Z',
      approvedAt: '2024-06-12T11:00:00Z',
      campaignId: 'CAMP_XYZ789',
      sampleMessages: [
        'Hi {name}! Get 20% off your next order with code SAVE20. Reply STOP to opt out.',
        'Flash sale! 50% off all items today only. Shop now at example.com. Reply STOP to unsubscribe.'
      ]
    },
    {
      id: 2,
      campaignName: 'Appointment Reminders',
      useCase: '2FA',
      description: 'Appointment confirmations and reminders',
      status: 'pending',
      brandId: 1,
      submittedAt: '2025-05-10T14:00:00Z',
      approvedAt: null,
      campaignId: null,
      sampleMessages: [
        'Reminder: Your appointment is scheduled for tomorrow at 2pm. Reply YES to confirm or call us to reschedule.',
        'Your appointment has been confirmed for {date} at {time}. See you then!'
      ]
    }
  ]);

  const useCases = [
    { id: '2FA', label: '2FA / Authentication', description: 'One-time passwords and verification codes' },
    { id: 'ACCOUNT_NOTIFICATION', label: 'Account Notifications', description: 'Account updates and alerts' },
    { id: 'CUSTOMER_CARE', label: 'Customer Care', description: 'Customer support messages' },
    { id: 'DELIVERY_NOTIFICATION', label: 'Delivery Notifications', description: 'Shipping and delivery updates' },
    { id: 'FRAUD_ALERT', label: 'Fraud Alerts', description: 'Security and fraud notifications' },
    { id: 'HIGHER_EDUCATION', label: 'Higher Education', description: 'University/college communications' },
    { id: 'LOW_VOLUME', label: 'Low Volume Mixed', description: 'Mixed use cases with low volume' },
    { id: 'MARKETING', label: 'Marketing', description: 'Promotional messages and offers' },
    { id: 'POLLING_VOTING', label: 'Polling & Voting', description: 'Surveys and voting campaigns' },
    { id: 'PUBLIC_SERVICE', label: 'Public Service', description: 'Government and public announcements' },
  ];

  const verticals = [
    'Agriculture', 'Automotive', 'Banking', 'Consumer Services', 'Education',
    'Energy', 'Entertainment', 'Financial Services', 'Food & Beverage', 'Government',
    'Healthcare', 'Hospitality', 'Insurance', 'Legal', 'Manufacturing',
    'Media', 'Non-Profit', 'Real Estate', 'Retail', 'Technology', 'Transportation'
  ];

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

  const handleSubmitBrand = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newBrand: BrandRegistration = {
      id: brands.length + 1,
      brandName: brandForm.brandName,
      companyName: brandForm.companyName,
      ein: brandForm.ein,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      approvedAt: null,
      brandId: null
    };
    
    setBrands([...brands, newBrand]);
    setShowBrandModal(false);
    setIsSubmitting(false);
    setBrandForm({
      brandName: '', companyName: '', ein: '', website: '', vertical: '',
      stockSymbol: '', stockExchange: '', companyType: 'private',
      address: '', city: '', state: '', zip: '', country: 'US',
      contactName: '', contactEmail: '', contactPhone: ''
    });
    
    toast({
      title: 'Brand registration submitted',
      description: 'Your brand registration is now pending review. This typically takes 1-3 business days.'
    });
  };

  const handleSubmitCampaign = async () => {
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newCampaign: CampaignRegistration = {
      id: campaigns.length + 1,
      campaignName: campaignForm.campaignName,
      useCase: campaignForm.useCase,
      description: campaignForm.description,
      status: 'pending',
      brandId: 1,
      submittedAt: new Date().toISOString(),
      approvedAt: null,
      campaignId: null,
      sampleMessages: [campaignForm.sampleMessage1, campaignForm.sampleMessage2]
    };
    
    setCampaigns([...campaigns, newCampaign]);
    setShowCampaignModal(false);
    setIsSubmitting(false);
    setCampaignForm({
      campaignName: '', useCase: '', description: '',
      sampleMessage1: '', sampleMessage2: '', messageFlow: '',
      optInKeywords: 'START, YES', optOutKeywords: 'STOP, UNSUBSCRIBE',
      helpKeywords: 'HELP, INFO', optInMessage: '', optOutMessage: '',
      helpMessage: '', embeddedLinks: false, embeddedPhone: false,
      ageGated: false, directLending: false
    });
    
    toast({
      title: 'Campaign registration submitted',
      description: 'Your campaign is now pending review. This typically takes 1-5 business days.'
    });
  };

  const approvedBrand = brands.find(b => b.status === 'approved');
  const approvedCampaigns = campaigns.filter(c => c.status === 'approved');

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Compliance & A2P 10DLC</h1>
        <p className="text-gray-500">Register your brand and campaigns for A2P 10DLC messaging compliance</p>
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
            Number Assignment
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
                  <p className="text-sm text-gray-500 mt-1">Brand ID: {approvedBrand.brandId}</p>
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
                Register your brand to unlock higher messaging throughput and better deliverability.
              </p>
              <button
                onClick={() => { setActiveTab('brand'); setShowBrandModal(true); }}
                className="bg-white text-blue-600 px-4 py-2 rounded-md font-medium hover:bg-blue-50 flex items-center"
              >
                Register Your Brand
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Brand Registration Tab */}
      {activeTab === 'brand' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Brand Registrations</h3>
            <button
              onClick={() => setShowBrandModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Register New Brand
            </button>
          </div>

          {brands.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 divide-y">
              {brands.map((brand) => (
                <div key={brand.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{brand.brandName}</h4>
                        {getStatusBadge(brand.status)}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{brand.companyName}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        <span>EIN: {brand.ein}</span>
                        {brand.brandId && <span>Brand ID: {brand.brandId}</span>}
                        {brand.submittedAt && (
                          <span>Submitted: {new Date(brand.submittedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Brand Registered</h3>
              <p className="text-gray-500 mb-4">Register your brand to start the A2P 10DLC process</p>
              <button
                onClick={() => setShowBrandModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Register Brand
              </button>
            </div>
          )}
        </div>
      )}

      {/* Campaign Registration Tab */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Campaign Registrations</h3>
            <button
              onClick={() => setShowCampaignModal(true)}
              disabled={!approvedBrand}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Register New Campaign
            </button>
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
                    <div>
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{campaign.campaignName}</h4>
                        {getStatusBadge(campaign.status)}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{campaign.description}</p>
                      <div className="flex items-center space-x-4 mt-2">
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                          {useCases.find(u => u.id === campaign.useCase)?.label || campaign.useCase}
                        </span>
                        {campaign.campaignId && (
                          <span className="text-sm text-gray-500">Campaign ID: {campaign.campaignId}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
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

      {/* Number Assignment Tab */}
      {activeTab === 'numbers' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium mb-4">Phone Number Assignment</h3>
            <p className="text-gray-600 mb-4">
              Assign your phone numbers to approved campaigns. Each number can only be assigned to one campaign at a time.
            </p>
            
            {approvedCampaigns.length > 0 ? (
              <div className="space-y-4">
                {approvedCampaigns.map((campaign) => (
                  <div key={campaign.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-gray-900">{campaign.campaignName}</h4>
                        <p className="text-sm text-gray-500">Campaign ID: {campaign.campaignId}</p>
                      </div>
                      <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                        Assign Numbers
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-sm text-gray-500">No phone numbers assigned yet</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h4 className="font-medium text-gray-900 mb-2">No Approved Campaigns</h4>
                <p className="text-gray-500">
                  You need at least one approved campaign before you can assign phone numbers.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Brand Registration Modal */}
      {showBrandModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Register Brand</h2>
              <p className="text-gray-500 text-sm mt-1">Provide your business information for A2P 10DLC registration</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Company Information */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4">Company Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.brandName}
                      onChange={(e) => setBrandForm({ ...brandForm, brandName: e.target.value })}
                      placeholder="Your brand name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Legal Company Name *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.companyName}
                      onChange={(e) => setBrandForm({ ...brandForm, companyName: e.target.value })}
                      placeholder="Legal entity name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">EIN / Tax ID *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.ein}
                      onChange={(e) => setBrandForm({ ...brandForm, ein: e.target.value })}
                      placeholder="XX-XXXXXXX"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="url"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.website}
                      onChange={(e) => setBrandForm({ ...brandForm, website: e.target.value })}
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Industry Vertical *</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.vertical}
                      onChange={(e) => setBrandForm({ ...brandForm, vertical: e.target.value })}
                    >
                      <option value="">Select industry</option>
                      {verticals.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Type *</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.companyType}
                      onChange={(e) => setBrandForm({ ...brandForm, companyType: e.target.value })}
                    >
                      <option value="private">Private Company</option>
                      <option value="public">Public Company</option>
                      <option value="nonprofit">Non-Profit</option>
                      <option value="government">Government</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.contactName}
                      onChange={(e) => setBrandForm({ ...brandForm, contactName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email *</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.contactEmail}
                      onChange={(e) => setBrandForm({ ...brandForm, contactEmail: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone *</label>
                    <input
                      type="tel"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={brandForm.contactPhone}
                      onChange={(e) => setBrandForm({ ...brandForm, contactPhone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setShowBrandModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitBrand}
                disabled={isSubmitting || !brandForm.brandName || !brandForm.companyName || !brandForm.ein}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Registration'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Registration Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Register Campaign</h2>
              <p className="text-gray-500 text-sm mt-1">Define your messaging use case and sample messages</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Campaign Details */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4">Campaign Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={campaignForm.campaignName}
                      onChange={(e) => setCampaignForm({ ...campaignForm, campaignName: e.target.value })}
                      placeholder="e.g., Marketing Notifications"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Use Case *</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={campaignForm.useCase}
                      onChange={(e) => setCampaignForm({ ...campaignForm, useCase: e.target.value })}
                    >
                      <option value="">Select use case</option>
                      {useCases.map((uc) => (
                        <option key={uc.id} value={uc.id}>{uc.label} - {uc.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Description *</label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      value={campaignForm.description}
                      onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                      placeholder="Describe what messages you'll send and to whom"
                    />
                  </div>
                </div>
              </div>

              {/* Sample Messages */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4">Sample Messages</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sample Message 1 *</label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      value={campaignForm.sampleMessage1}
                      onChange={(e) => setCampaignForm({ ...campaignForm, sampleMessage1: e.target.value })}
                      placeholder="Include opt-out language (e.g., Reply STOP to unsubscribe)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sample Message 2 *</label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      value={campaignForm.sampleMessage2}
                      onChange={(e) => setCampaignForm({ ...campaignForm, sampleMessage2: e.target.value })}
                      placeholder="Another example of messages you'll send"
                    />
                  </div>
                </div>
              </div>

              {/* Content Attributes */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4">Content Attributes</h3>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={campaignForm.embeddedLinks}
                      onChange={(e) => setCampaignForm({ ...campaignForm, embeddedLinks: e.target.checked })}
                    />
                    <span className="ml-2 text-sm text-gray-700">Messages will contain embedded links</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={campaignForm.embeddedPhone}
                      onChange={(e) => setCampaignForm({ ...campaignForm, embeddedPhone: e.target.checked })}
                    />
                    <span className="ml-2 text-sm text-gray-700">Messages will contain phone numbers</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={campaignForm.ageGated}
                      onChange={(e) => setCampaignForm({ ...campaignForm, ageGated: e.target.checked })}
                    />
                    <span className="ml-2 text-sm text-gray-700">Content is age-gated (21+)</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setShowCampaignModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCampaign}
                disabled={isSubmitting || !campaignForm.campaignName || !campaignForm.useCase || !campaignForm.description}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Campaign'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}