// Auto-refill service - Automatically purchases credits when user balance falls below threshold
import { storage } from './storage';
import { User } from '@shared/schema';

export class AutoRefillService {
  private isRunning: boolean = false;
  private checkIntervalMs: number = 60 * 60 * 1000; // Check every hour by default
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    console.log('Auto-refill service initialized');
  }

  /**
   * Start the auto-refill service
   */
  public start(): void {
    if (this.isRunning) {
      console.log('Auto-refill service is already running');
      return;
    }

    console.log('Starting auto-refill service');
    this.isRunning = true;
    
    // Run immediately once on startup
    this.checkAllUserBalances();
    
    // Then schedule regular checks
    this.intervalId = setInterval(() => {
      this.checkAllUserBalances();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the auto-refill service
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('Auto-refill service is not running');
      return;
    }

    console.log('Stopping auto-refill service');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check all user balances and process auto-refills if needed
   */
  private async checkAllUserBalances(): Promise<void> {
    try {
      console.log('Checking all user balances for auto-refill');
      
      // Get all users
      const usersMap = storage.getUsersForDebug();
      
      // Process each user that has auto-refill enabled
      Array.from(usersMap.values()).forEach(async (user) => {
        await this.processUserAutoRefill(user);
      });
      
      console.log('Auto-refill check completed');
    } catch (error) {
      console.error('Error checking user balances for auto-refill:', error);
    }
  }

  /**
   * Process auto-refill for a single user if needed
   */
  private async processUserAutoRefill(user: User): Promise<void> {
    // Skip if auto-refill is not enabled or if threshold/amount are not set
    if (!user.autoRefillEnabled || !user.autoRefillThreshold || !user.autoRefillAmount) {
      return;
    }

    try {
      // Check if user's credit balance is below the threshold
      if (user.credits <= user.autoRefillThreshold) {
        console.log(`User ${user.id} (${user.username}) credits (${user.credits}) below threshold (${user.autoRefillThreshold}), processing auto-refill`);
        
        // Calculate the amount of credits to purchase based on user's auto-refill settings
        const creditsToPurchase = user.autoRefillAmount;
        
        // Calculate the price based on volume discounts
        const pricePerCredit = this.calculatePricePerCredit(creditsToPurchase);
        const totalPrice = creditsToPurchase * pricePerCredit;
        
        // Create a billing transaction for the auto-refill
        await storage.createBillingTransaction({
          userId: user.id,
          amount: totalPrice,
          type: 'credit-purchase',
          description: `Auto-refill of ${creditsToPurchase} credits`,
          credits: creditsToPurchase
        });
        
        console.log(`Auto-refill successful for user ${user.id}: ${creditsToPurchase} credits purchased for $${totalPrice.toFixed(2)}`);
      }
    } catch (error) {
      console.error(`Error processing auto-refill for user ${user.id}:`, error);
    }
  }

  /**
   * Calculate price per credit based on volume discounts
   */
  private calculatePricePerCredit(creditAmount: number): number {
    // Apply volume discounts
    if (creditAmount >= 100000) return 0.0080; // $0.008 per credit for 100k+
    if (creditAmount >= 50000) return 0.0085;  // $0.0085 per credit for 50k+
    if (creditAmount >= 10000) return 0.0090;  // $0.009 per credit for 10k+
    return 0.0100;                             // $0.01 per credit for less than 10k
  }

  /**
   * Manually trigger an auto-refill check for a specific user
   */
  public async checkUserBalance(userId: number): Promise<boolean> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        console.error(`User ${userId} not found for auto-refill check`);
        return false;
      }
      
      await this.processUserAutoRefill(user);
      return true;
    } catch (error) {
      console.error(`Error checking balance for user ${userId}:`, error);
      return false;
    }
  }
}

// Create a singleton instance
export const autoRefillService = new AutoRefillService();