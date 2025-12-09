import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Campaign } from "@shared/schema";
import { MessageSquare, Mail, Phone, Users, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface CampaignStatusProps {
  campaigns: Campaign[];
  className?: string;
  viewAllHref?: string;
}

export function CampaignStatus({ 
  campaigns, 
  className,
  viewAllHref = "/campaigns"
}: CampaignStatusProps) {
  // Get badge color based on campaign status
  const getBadgeVariant = (status: string) => {
    switch(status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
      case 'scheduled':
        return <Badge className="bg-secondary-100 text-secondary-800 hover:bg-secondary-100">Scheduled</Badge>;
      case 'completed':
        return <Badge className="bg-neutral-100 text-neutral-800 hover:bg-neutral-100">Completed</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Paused</Badge>;
      case 'draft':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Get campaign type icon
  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'sms':
        return <MessageSquare className="h-4 w-4 mr-1" />;
      case 'email':
        return <Mail className="h-4 w-4 mr-1" />;
      case 'voice':
        return <Phone className="h-4 w-4 mr-1" />;
      default:
        return <MessageSquare className="h-4 w-4 mr-1" />;
    }
  };

  // Format campaign end date
  const formatEndDate = (endsAt: Date | null | undefined) => {
    if (!endsAt) return 'No end date';
    
    const now = new Date();
    const end = new Date(endsAt);
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Ended';
    if (diffDays === 0) return 'Ends today';
    if (diffDays === 1) return 'Ends tomorrow';
    return `Ends in ${diffDays} days`;
  };

  // Calculate progress percentage
  const getProgressPercentage = (campaign: Campaign) => {
    if (campaign.recipientCount === 0) return 0;
    return Math.round((campaign.sentCount / campaign.recipientCount) * 100);
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <CardTitle className="text-lg font-medium">Active Campaigns</CardTitle>
        <a href={viewAllHref} className="text-sm font-medium text-primary hover:text-primary-700">
          View all
        </a>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-neutral-200">
          {campaigns.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-neutral-500 text-sm">
                No active campaigns found
              </p>
              <a 
                href="/campaigns/new" 
                className="inline-block mt-2 text-sm font-medium text-primary hover:text-primary-700"
              >
                Create a campaign
              </a>
            </div>
          ) : (
            campaigns.map((campaign) => (
              <div key={campaign.id} className="px-5 py-4 hover:bg-neutral-50">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="text-sm font-medium text-neutral-900">{campaign.name}</h4>
                  {getBadgeVariant(campaign.status)}
                </div>
                <div className="flex text-neutral-500 text-xs space-x-4 mb-2">
                  <span className="flex items-center">
                    {getTypeIcon(campaign.type)} 
                    {campaign.type.toUpperCase()}
                  </span>
                  <span className="flex items-center">
                    <Users className="h-4 w-4 mr-1" /> 
                    {campaign.recipientCount} contacts
                  </span>
                  <span className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" /> 
                    {formatEndDate(campaign.endsAt)}
                  </span>
                </div>
                <Progress value={getProgressPercentage(campaign)} className="h-1.5 bg-neutral-200" />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-neutral-500">
                    {getProgressPercentage(campaign)}% delivered
                  </span>
                  <span className="text-xs text-neutral-500">
                    {campaign.deliveredCount} / {campaign.recipientCount}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
