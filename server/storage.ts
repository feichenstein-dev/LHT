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

export const storage = new DatabaseStorage();
