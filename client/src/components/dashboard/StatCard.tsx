import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  iconClassName?: string;
  change?: number;
  className?: string;
}

export function StatCard({ title, value, icon, iconClassName, change, className }: StatCardProps) {
  const isPositiveChange = change && change > 0;
  
  return (
    <div className={cn("bg-white rounded-lg shadow px-5 py-4 sm:p-6", className)}>
      <div className="flex items-center">
        <div className={cn("flex-shrink-0 rounded-md p-3", iconClassName)}>
          {icon}
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-neutral-500 truncate">{title}</dt>
            <dd className="flex items-baseline">
              <div className="text-2xl font-semibold text-neutral-900">{value}</div>
              {change !== undefined && (
                <div 
                  className={cn(
                    "ml-2 flex items-baseline text-sm font-semibold",
                    isPositiveChange ? "text-green-500" : "text-red-500"
                  )}
                >
                  {isPositiveChange ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                  <span className="ml-1">{Math.abs(change)}%</span>
                </div>
              )}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
