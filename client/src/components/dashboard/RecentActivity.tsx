import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Phone, Mail, UserPlus } from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Activity } from "@/types";

interface RecentActivityProps {
  activities: Activity[];
  className?: string;
  viewAllHref?: string;
}

export function RecentActivity({ 
  activities, 
  className,
  viewAllHref = "/logs"
}: RecentActivityProps) {
  // Function to get icon based on activity type
  const getIcon = (type: string) => {
    switch(type) {
      case 'sms':
        return <MessageSquare className="h-5 w-5 text-primary" />;
      case 'voice':
        return <Phone className="h-5 w-5 text-secondary" />;
      case 'email':
        return <Mail className="h-5 w-5 text-green-500" />;
      case 'campaign':
        return <MessageSquare className="h-5 w-5 text-primary" />;
      case 'user':
      case 'subaccount':
        return <UserPlus className="h-5 w-5 text-primary" />;
      default:
        return <MessageSquare className="h-5 w-5 text-neutral-500" />;
    }
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader className="px-5 py-4 border-b border-neutral-200">
        <CardTitle className="text-lg font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="px-5 py-4">
        <div className="flow-root">
          <ul role="list" className="-mb-8">
            {activities.map((activity, index) => (
              <li key={activity.id}>
                <div className="relative pb-8">
                  {index < activities.length - 1 && (
                    <span 
                      className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-neutral-200" 
                      aria-hidden="true" 
                    />
                  )}
                  <div className="relative flex items-start space-x-3">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center ring-8 ring-white">
                        {getIcon(activity.type)}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div>
                        <div className="text-sm">
                          <a href="#" className="font-medium text-neutral-900">
                            {activity.title}
                          </a>
                        </div>
                        <p className="mt-0.5 text-sm text-neutral-500">
                          {activity.description}
                        </p>
                      </div>
                      <div className="mt-2 text-sm text-neutral-500">
                        <span>{formatRelativeTime(activity.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 text-center">
          <a href={viewAllHref} className="text-sm font-medium text-primary hover:text-primary-700">
            View all activity
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
