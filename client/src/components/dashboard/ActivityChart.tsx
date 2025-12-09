import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn, formatNumber } from '@/lib/utils';
import { DailyActivity } from '@/types';

interface ActivityChartProps {
  data: DailyActivity[];
  deliveryRate: number;
  responseRate: number;
  totalSent: number;
  className?: string;
}

export function ActivityChart({
  data,
  deliveryRate,
  responseRate,
  totalSent,
  className,
}: ActivityChartProps) {
  const [activeType, setActiveType] = useState<'sms' | 'voice' | 'email'>('sms');

  const chartColors = {
    sms: "hsl(var(--primary))",
    voice: "hsl(var(--secondary))",
    email: "hsl(var(--chart-3))",
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader className="px-5 py-4 border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">Communication Activity</CardTitle>
          <div className="flex space-x-3">
            <Button
              onClick={() => setActiveType('sms')}
              variant="link"
              className={activeType === 'sms' ? 'text-primary' : 'text-neutral-500'}
            >
              SMS
            </Button>
            <Button
              onClick={() => setActiveType('voice')}
              variant="link"
              className={activeType === 'voice' ? 'text-primary' : 'text-neutral-500'}
            >
              Voice
            </Button>
            <Button
              onClick={() => setActiveType('email')}
              variant="link"
              className={activeType === 'email' ? 'text-primary' : 'text-neutral-500'}
            >
              Email
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{
                top: 5,
                right: 5,
                left: 5,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [formatNumber(Number(value)), activeType]} />
              <Legend />
              {activeType === 'sms' && (
                <Line
                  type="monotone"
                  dataKey="sms"
                  stroke={chartColors.sms}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                  name="SMS"
                />
              )}
              {activeType === 'voice' && (
                <Line
                  type="monotone"
                  dataKey="voice"
                  stroke={chartColors.voice}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                  name="Voice"
                />
              )}
              {activeType === 'email' && (
                <Line
                  type="monotone"
                  dataKey="email"
                  stroke={chartColors.email}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                  name="Email"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 grid grid-cols-3 gap-5 text-center">
          <div>
            <div className="text-lg font-semibold text-neutral-900">{formatNumber(totalSent)}</div>
            <div className="text-xs text-neutral-500">
              {activeType === 'sms' && 'SMS Sent'}
              {activeType === 'voice' && 'Voice Minutes'}
              {activeType === 'email' && 'Emails Sent'}
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold text-neutral-900">{deliveryRate.toFixed(1)}%</div>
            <div className="text-xs text-neutral-500">Delivery Rate</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-neutral-900">{responseRate.toFixed(1)}%</div>
            <div className="text-xs text-neutral-500">Response Rate</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
