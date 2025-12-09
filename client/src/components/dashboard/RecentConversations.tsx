import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime, getInitials, getAvatarColor, truncateText } from "@/lib/utils";
import { Conversation } from "@/types";
import { cn } from "@/lib/utils";

interface RecentConversationsProps {
  conversations: Conversation[];
  className?: string;
  viewAllHref?: string;
}

export function RecentConversations({ 
  conversations, 
  className,
  viewAllHref = "/sms"
}: RecentConversationsProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <CardTitle className="text-lg font-medium">Recent Conversations</CardTitle>
        <a href={viewAllHref} className="text-sm font-medium text-primary hover:text-primary-700">
          View all
        </a>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-neutral-200">
          {conversations.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-neutral-500 text-sm">
                No recent conversations found
              </p>
              <a 
                href="/sms/new" 
                className="inline-block mt-2 text-sm font-medium text-primary hover:text-primary-700"
              >
                Start a conversation
              </a>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div key={conversation.contact.id || conversation.contact.phoneNumber || conversation.contact.email} 
                   className="px-5 py-4 hover:bg-neutral-50">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    {conversation.contact.avatar ? (
                      <img 
                        src={conversation.contact.avatar} 
                        alt={conversation.contact.name}
                        className="h-10 w-10 rounded-full" 
                      />
                    ) : (
                      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", 
                                      getAvatarColor(conversation.contact.name))}>
                        <span className="text-sm font-medium">{conversation.contact.initials}</span>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-neutral-900">
                        {conversation.contact.name}
                      </h4>
                      <span className="text-xs text-neutral-500">
                        {formatRelativeTime(conversation.lastMessage.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-500 truncate">
                      {truncateText(conversation.lastMessage.text, 50)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
