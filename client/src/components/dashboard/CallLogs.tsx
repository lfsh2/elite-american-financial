import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Play, MoreHorizontal } from "lucide-react";
import { VoiceCall } from "@shared/schema";
import { formatPhoneForDisplay, formatDuration, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CallLogsProps {
  calls: VoiceCall[];
  className?: string;
  viewAllHref?: string;
}

export function CallLogs({ calls, className, viewAllHref = "/voice" }: CallLogsProps) {
  // Get status badge
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
      case 'in-progress':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
      case 'no-answer':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">No Answer</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <CardTitle className="text-lg font-medium">Recent Call Logs</CardTitle>
        <a href={viewAllHref} className="text-sm font-medium text-primary hover:text-primary-700">
          View all logs
        </a>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Number
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Duration
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Time
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-neutral-500">
                    No call logs found
                  </td>
                </tr>
              ) : (
                calls.map((call) => (
                  <tr key={call.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Phone 
                          className={cn(
                            "mr-2", 
                            call.direction === 'inbound' 
                              ? "text-green-500" 
                              : "text-primary transform rotate-90"
                          )} 
                          size={16} 
                        />
                        <span className="text-sm text-neutral-900">
                          {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {formatPhoneForDisplay(call.direction === 'inbound' ? call.from : call.to)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(call.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      {formatDateTime(call.startTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!call.recordingUrl}
                        className={
                          call.recordingUrl 
                            ? "text-primary hover:text-primary-700" 
                            : "text-neutral-400 cursor-not-allowed"
                        }
                      >
                        <Play size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-neutral-600 hover:text-neutral-800">
                        <MoreHorizontal size={16} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
