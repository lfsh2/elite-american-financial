import OpenAI from 'openai';
import { businessIntelligenceService } from './businessIntelligence';

// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('OpenAI client initialized successfully');
} else {
  console.log('OpenAI API key not configured or invalid format. AI insights will use mock data.');
}

export interface MessagingStats {
  messagesSent: number;
  messagesReceived: number;
  deliveryRate: number;
  errorRate: number;
  optOutRate: number;
  activeUsers: number;
  topHours: number[];
  weeklyTrend: number[];
}

export interface AIInsight {
  title: string;
  description: string;
  type: 'success' | 'warning' | 'info' | 'tip';
  metric?: string;
  recommendation?: string;
}

export async function generateMessagingInsights(stats: MessagingStats): Promise<AIInsight[]> {
  if (!openai) {
    console.log('OpenAI not configured - using mock insights');
    return getMockInsights(stats);
  }

  console.log('Generating AI insights using OpenAI API...');
  
  try {
    const prompt = `You are an AI analytics assistant for a business messaging platform called SyncGrid. Analyze the following messaging statistics and provide 4-5 actionable insights.

Statistics:
- Messages Sent: ${stats.messagesSent}
- Messages Received: ${stats.messagesReceived}
- Delivery Rate: ${stats.deliveryRate}%
- Error Rate: ${stats.errorRate}%
- Opt-Out Rate: ${stats.optOutRate}%
- Active Users: ${stats.activeUsers}
- Peak Hours (24h format): ${stats.topHours.join(', ')}
- Weekly Message Trend: ${stats.weeklyTrend.join(', ')}

Provide insights in JSON format as an array of objects with these fields:
- title: Short title (max 50 chars)
- description: Detailed insight (max 150 chars)
- type: One of "success", "warning", "info", or "tip"
- metric: The key metric this insight relates to
- recommendation: Actionable recommendation (max 100 chars)

Focus on:
1. Delivery performance
2. Engagement patterns
3. Growth opportunities
4. Potential issues
5. Best practices

Return ONLY valid JSON array, no markdown or explanation.`;

    const response = await openai!.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a messaging analytics expert. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    const insights: AIInsight[] = JSON.parse(content);
    console.log(`OpenAI generated ${insights.length} insights successfully`);
    return insights;
  } catch (error) {
    console.error('OpenAI API error:', error);
    console.log('Falling back to mock insights due to API error');
    return getMockInsights(stats);
  }
}

export async function generateCustomInsight(question: string, stats: MessagingStats): Promise<string> {
  if (!openai) {
    return "AI insights require a valid OpenAI API key. Please configure your API key to enable this feature.";
  }

  console.log(`Processing AI question: "${question.substring(0, 50)}..."`);
  
  try {
    const response = await openai!.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an AI analytics assistant for SyncGrid, a business messaging platform. You help users understand their messaging performance and provide actionable recommendations. Be concise and helpful.

Current Statistics:
- Messages Sent: ${stats.messagesSent}
- Messages Received: ${stats.messagesReceived}
- Delivery Rate: ${stats.deliveryRate}%
- Error Rate: ${stats.errorRate}%
- Opt-Out Rate: ${stats.optOutRate}%
- Active Users: ${stats.activeUsers}`
        },
        {
          role: 'user',
          content: question
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = response.choices[0]?.message?.content || "I couldn't generate an insight for that question.";
    console.log('OpenAI answered question successfully');
    return answer;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return "Sorry, I encountered an error while generating insights. Please try again later.";
  }
}

function getMockInsights(stats: MessagingStats): AIInsight[] {
  const insights: AIInsight[] = [];

  // Delivery rate insight
  if (stats.deliveryRate >= 98) {
    insights.push({
      title: 'Excellent Delivery Rate',
      description: `Your ${stats.deliveryRate}% delivery rate is above industry average. Your sender reputation is strong.`,
      type: 'success',
      metric: 'Delivery Rate',
      recommendation: 'Maintain current practices to keep this high performance.'
    });
  } else if (stats.deliveryRate < 95) {
    insights.push({
      title: 'Delivery Rate Needs Attention',
      description: `Your ${stats.deliveryRate}% delivery rate is below optimal. Consider reviewing your contact list quality.`,
      type: 'warning',
      metric: 'Delivery Rate',
      recommendation: 'Clean your contact list and verify phone numbers.'
    });
  }

  // Error rate insight
  if (stats.errorRate > 2) {
    insights.push({
      title: 'High Error Rate Detected',
      description: `${stats.errorRate}% of messages are failing. This may indicate invalid numbers or carrier issues.`,
      type: 'warning',
      metric: 'Error Rate',
      recommendation: 'Review error logs and remove invalid contacts.'
    });
  }

  // Engagement insight
  insights.push({
    title: 'Peak Engagement Hours',
    description: `Your messages perform best between ${stats.topHours[0] || 10}:00 and ${stats.topHours[1] || 14}:00. Schedule campaigns accordingly.`,
    type: 'tip',
    metric: 'Engagement',
    recommendation: 'Schedule important campaigns during peak hours.'
  });

  // Growth insight
  const weeklyGrowth = stats.weeklyTrend.length > 1 
    ? ((stats.weeklyTrend[stats.weeklyTrend.length - 1] - stats.weeklyTrend[0]) / stats.weeklyTrend[0] * 100).toFixed(1)
    : '0';
  
  insights.push({
    title: 'Weekly Messaging Trend',
    description: `Your messaging volume has ${Number(weeklyGrowth) >= 0 ? 'increased' : 'decreased'} by ${Math.abs(Number(weeklyGrowth))}% this week.`,
    type: Number(weeklyGrowth) >= 0 ? 'info' : 'warning',
    metric: 'Volume',
    recommendation: Number(weeklyGrowth) >= 0 ? 'Great momentum! Consider expanding your campaigns.' : 'Review your campaign strategy to boost engagement.'
  });

  // Opt-out insight
  if (stats.optOutRate > 1) {
    insights.push({
      title: 'Monitor Opt-Out Rate',
      description: `Your ${stats.optOutRate}% opt-out rate suggests some recipients may find messages too frequent.`,
      type: 'warning',
      metric: 'Opt-Out Rate',
      recommendation: 'Consider reducing message frequency or improving content relevance.'
    });
  } else {
    insights.push({
      title: 'Low Opt-Out Rate',
      description: `Your ${stats.optOutRate}% opt-out rate indicates good content relevance and appropriate frequency.`,
      type: 'success',
      metric: 'Opt-Out Rate',
      recommendation: 'Continue with your current messaging strategy.'
    });
  }

  return insights;
}

/**
 * AI Chatbot with Real-Time Business Intelligence
 * Fetches live data from database and provides contextual responses
 */
export async function chatWithAI(message: string, userId?: number): Promise<string> {
  if (!openai) {
    return "AI chat requires a valid OpenAI API key. Please configure your API key to enable this feature.";
  }

  console.log(`AI Chat: Processing message - "${message.substring(0, 50)}..."`);

  try {
    // Fetch real-time business intelligence data
    const biReport = await businessIntelligenceService.generateAISummary(userId);
    
    const systemPrompt = `You are SyncGrid AI, a senior business intelligence assistant for a business messaging and communication platform. You provide executive-level insights, KPI analysis, and actionable recommendations.

${biReport}

═══════════════════════════════════════════════════════════════
ASSISTANT GUIDELINES
═══════════════════════════════════════════════════════════════
1. You are a senior business analyst - provide strategic insights, not just data
2. When asked for summaries, structure responses with clear sections and bullet points
3. Always include relevant KPIs and metrics with context (good/bad, trending up/down)
4. Proactively highlight anomalies, risks, and opportunities
5. Provide actionable recommendations based on the data
6. Compare periods (today vs yesterday, this week vs last week) when relevant
7. Use professional but approachable language
8. Format numbers clearly (use commas, percentages, currency symbols)
9. If data shows concerning trends, flag them with appropriate urgency
10. Celebrate wins and positive metrics

RESPONSE FORMAT:
- Use clear headings for different sections
- Use bullet points for lists
- Bold important numbers and metrics
- Include trend indicators (↑ ↓ →) where appropriate
- End with a brief recommendation or next step when applicable`;

    const response = await openai!.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const answer = response.choices[0]?.message?.content || "I couldn't process that request.";
    console.log('AI Chat: Response generated successfully with real-time BI data');
    return answer;
  } catch (error) {
    console.error('AI Chat error:', error);
    return "Sorry, I encountered an error while processing your request. Please try again.";
  }
}

/**
 * Get KPI Dashboard data for API endpoints
 */
export async function getKPIDashboard(userId?: number) {
  return businessIntelligenceService.getKPIDashboard(userId);
}

export default {
  generateMessagingInsights,
  generateCustomInsight,
  chatWithAI
};
