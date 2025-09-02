import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, like, and, count, sql } from "drizzle-orm";
import { 
  type Message, 
  type Subscriber, 
  type DeliveryLog, 
  type InsertMessage, 
  type InsertSubscriber, 
  type InsertDeliveryLog,
  messages,
  subscribers,
  delivery_logs 
} from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to the database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err.message);
});

const db = drizzle(pool);

export interface IStorage {
  // Messages
  getMessages(): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessageById(id: string): Promise<Message | undefined>;

  // Subscribers
  getSubscribers(): Promise<Subscriber[]>;
  getActiveSubscribers(): Promise<Subscriber[]>;
  createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber>;
  deleteSubscriber(id: string): Promise<void>;
  getSubscriberByPhone(phoneNumber: string): Promise<Subscriber | undefined>;

  // Delivery Logs
  getDeliveryLogs(filters?: {
    search?: string;
    status?: string;
    dateRange?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }>;
  createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog>;
  updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void>;
  getDeliveryStats(): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
  }>;
}

class MemoryStorage implements IStorage {
  private messages: Message[] = [];
  private subscribers: Subscriber[] = [];
  private deliveryLogs: (DeliveryLog & { subscriber: Subscriber | null })[] = [];

  async getMessages(): Promise<Message[]> {
    return this.messages.sort((a, b) => new Date(b.sent_at || '').getTime() - new Date(a.sent_at || '').getTime());
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      body: message.body,
      sent_at: new Date(),
    };
    this.messages.push(newMessage);
    return newMessage;
  }

  async getMessageById(id: string): Promise<Message | undefined> {
    return this.messages.find(m => m.id === id);
  }

  async getSubscribers(): Promise<Subscriber[]> {
    return this.subscribers.sort((a, b) => new Date(b.joined_at || '').getTime() - new Date(a.joined_at || '').getTime());
  }

  async getActiveSubscribers(): Promise<Subscriber[]> {
    return this.subscribers.filter(s => s.status === 'active');
  }

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber> {
    const newSubscriber: Subscriber = {
      id: crypto.randomUUID(),
      phone_number: subscriber.phone_number,
      joined_at: new Date(),
      status: subscriber.status || 'active',
    };
    this.subscribers.push(newSubscriber);
    return newSubscriber;
  }

  async deleteSubscriber(id: string): Promise<void> {
    this.subscribers = this.subscribers.filter(s => s.id !== id);
  }

  async getSubscriberByPhone(phoneNumber: string): Promise<Subscriber | undefined> {
    return this.subscribers.find(s => s.phone_number === phoneNumber);
  }

  async getDeliveryLogs(filters: any = {}): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }> {
    let filteredLogs = [...this.deliveryLogs];
    
    if (filters.search) {
      filteredLogs = filteredLogs.filter(log => 
        log.message_text?.toLowerCase().includes(filters.search.toLowerCase()) ||
        log.subscriber?.phone_number.includes(filters.search)
      );
    }
    
    if (filters.status) {
      filteredLogs = filteredLogs.filter(log => log.status === filters.status);
    }
    
    const total = filteredLogs.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 10;
    
    return {
      logs: filteredLogs.slice(offset, offset + limit),
      total
    };
  }

  async createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog> {
    const subscriber = log.subscriber_id ? await this.subscribers.find(s => s.id === log.subscriber_id) || null : null;
    const newLog: DeliveryLog & { subscriber: Subscriber | null } = {
      id: crypto.randomUUID(),
      message_id: log.message_id || null,
      subscriber_id: log.subscriber_id || null,
      status: log.status || null,
      telnyx_message_id: log.telnyx_message_id || null,
      updated_at: new Date(),
      direction: log.direction || null,
      message_text: log.message_text || null,
      subscriber
    };
    this.deliveryLogs.push(newLog);
    return newLog;
  }

  async updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void> {
    const log = this.deliveryLogs.find(l => l.id === id);
    if (log) {
      log.status = status;
      log.updated_at = new Date();
      if (telnyxMessageId) {
        log.telnyx_message_id = telnyxMessageId;
      }
    }
  }

  async getDeliveryStats(): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    const stats = {
      totalSent: this.deliveryLogs.length,
      delivered: this.deliveryLogs.filter(l => l.status === 'delivered').length,
      failed: this.deliveryLogs.filter(l => l.status === 'failed').length,
      pending: this.deliveryLogs.filter(l => ['pending', 'sent'].includes(l.status || '')).length,
    };
    return stats;
  }
}

export class DatabaseStorage implements IStorage {
  async getMessages(): Promise<Message[]> {
    return await db.select().from(messages).orderBy(desc(messages.sent_at));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getMessageById(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message;
  }

  async getSubscribers(): Promise<Subscriber[]> {
    return await db.select().from(subscribers).orderBy(desc(subscribers.joined_at));
  }

  async getActiveSubscribers(): Promise<Subscriber[]> {
    return await db.select().from(subscribers).where(eq(subscribers.status, "active"));
  }

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber> {
    const [newSubscriber] = await db.insert(subscribers).values(subscriber).returning();
    return newSubscriber;
  }

  async deleteSubscriber(id: string): Promise<void> {
    await db.delete(subscribers).where(eq(subscribers.id, id));
  }

  async getSubscriberByPhone(phoneNumber: string): Promise<Subscriber | undefined> {
    const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.phone_number, phoneNumber));
    return subscriber;
  }

  async getDeliveryLogs(filters: {
    search?: string;
    status?: string;
    dateRange?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }> {
    const { search, status, dateRange, limit = 10, offset = 0 } = filters;

    let whereConditions = [];

    if (search) {
      whereConditions.push(
        like(delivery_logs.message_text, `%${search}%`)
      );
    }

    if (status) {
      whereConditions.push(eq(delivery_logs.status, status));
    }

    if (dateRange) {
      const now = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }
      
      whereConditions.push(
        sql`${delivery_logs.updated_at} >= ${startDate.toISOString()}`
      );
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const logs = await db
      .select({
        id: delivery_logs.id,
        message_id: delivery_logs.message_id,
        subscriber_id: delivery_logs.subscriber_id,
        status: delivery_logs.status,
        telnyx_message_id: delivery_logs.telnyx_message_id,
        updated_at: delivery_logs.updated_at,
        direction: delivery_logs.direction,
        message_text: delivery_logs.message_text,
        subscriber: subscribers,
      })
      .from(delivery_logs)
      .leftJoin(subscribers, eq(delivery_logs.subscriber_id, subscribers.id))
      .where(whereClause)
      .orderBy(desc(delivery_logs.updated_at))
      .limit(limit)
      .offset(offset);

    const [{ count: total }] = await db
      .select({ count: count() })
      .from(delivery_logs)
      .where(whereClause);

    return { logs, total };
  }

  async createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog> {
    const [newLog] = await db.insert(delivery_logs).values(log).returning();
    return newLog;
  }

  async updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void> {
    const updateData: any = { status, updated_at: new Date() };
    if (telnyxMessageId) {
      updateData.telnyx_message_id = telnyxMessageId;
    }
    
    await db.update(delivery_logs)
      .set(updateData)
      .where(eq(delivery_logs.id, id));
  }

  async getDeliveryStats(): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    const stats = await db
      .select({
        status: delivery_logs.status,
        count: count(),
      })
      .from(delivery_logs)
      .groupBy(delivery_logs.status);

    const result = {
      totalSent: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
    };

    stats.forEach(stat => {
      const statusCount = Number(stat.count);
      result.totalSent += statusCount;
      
      switch (stat.status) {
        case 'delivered':
          result.delivered = statusCount;
          break;
        case 'failed':
          result.failed = statusCount;
          break;
        case 'pending':
        case 'sent':
          result.pending += statusCount;
          break;
      }
    });

    return result;
  }
}

class FallbackStorage implements IStorage {
  private dbStorage = new DatabaseStorage();
  private memoryStorage = new MemoryStorage();
  private useMemory = false;

  private async tryDatabase<T>(operation: () => Promise<T>): Promise<T> {
    if (this.useMemory) {
      throw new Error("Database unavailable, using memory storage");
    }
    
    try {
      return await operation();
    } catch (error) {
      console.log("Database error, switching to memory storage:", error);
      this.useMemory = true;
      throw error;
    }
  }

  async getMessages(): Promise<Message[]> {
    try {
      return await this.tryDatabase(() => this.dbStorage.getMessages());
    } catch {
      return await this.memoryStorage.getMessages();
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    try {
      return await this.tryDatabase(() => this.dbStorage.createMessage(message));
    } catch {
      return await this.memoryStorage.createMessage(message);
    }
  }

  async getMessageById(id: string): Promise<Message | undefined> {
    try {
      return await this.tryDatabase(() => this.dbStorage.getMessageById(id));
    } catch {
      return await this.memoryStorage.getMessageById(id);
    }
  }

  async getSubscribers(): Promise<Subscriber[]> {
    try {
      return await this.tryDatabase(() => this.dbStorage.getSubscribers());
    } catch {
      return await this.memoryStorage.getSubscribers();
    }
  }

  async getActiveSubscribers(): Promise<Subscriber[]> {
    try {
      return await this.tryDatabase(() => this.dbStorage.getActiveSubscribers());
    } catch {
      return await this.memoryStorage.getActiveSubscribers();
    }
  }

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber> {
    try {
      return await this.tryDatabase(() => this.dbStorage.createSubscriber(subscriber));
    } catch {
      return await this.memoryStorage.createSubscriber(subscriber);
    }
  }

  async deleteSubscriber(id: string): Promise<void> {
    try {
      return await this.tryDatabase(() => this.dbStorage.deleteSubscriber(id));
    } catch {
      return await this.memoryStorage.deleteSubscriber(id);
    }
  }

  async getSubscriberByPhone(phoneNumber: string): Promise<Subscriber | undefined> {
    try {
      return await this.tryDatabase(() => this.dbStorage.getSubscriberByPhone(phoneNumber));
    } catch {
      return await this.memoryStorage.getSubscriberByPhone(phoneNumber);
    }
  }

  async getDeliveryLogs(filters?: any): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }> {
    try {
      return await this.tryDatabase(() => this.dbStorage.getDeliveryLogs(filters));
    } catch {
      return await this.memoryStorage.getDeliveryLogs(filters);
    }
  }

  async createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog> {
    try {
      return await this.tryDatabase(() => this.dbStorage.createDeliveryLog(log));
    } catch {
      return await this.memoryStorage.createDeliveryLog(log);
    }
  }

  async updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void> {
    try {
      return await this.tryDatabase(() => this.dbStorage.updateDeliveryLogStatus(id, status, telnyxMessageId));
    } catch {
      return await this.memoryStorage.updateDeliveryLogStatus(id, status, telnyxMessageId);
    }
  }

  async getDeliveryStats(): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    try {
      return await this.tryDatabase(() => this.dbStorage.getDeliveryStats());
    } catch {
      return await this.memoryStorage.getDeliveryStats();
    }
  }
}

export const storage = new FallbackStorage();
