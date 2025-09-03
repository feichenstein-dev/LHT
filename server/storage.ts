import { supabase } from "./lib/supabase";
import {
  type Message,
  type Subscriber,
  type DeliveryLog,
  type InsertMessage,
  type InsertSubscriber,
  type InsertDeliveryLog
} from "@shared/schema";

// Supabase client is now used for all database operations

export interface IStorage {
  // Messages
  getMessages(): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message | undefined>;
  getMessageById(id: string): Promise<Message | undefined>;

  // Subscribers
  getSubscribers(): Promise<Subscriber[]>;
  getActiveSubscribers(): Promise<Subscriber[]>;
  createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber | undefined>;
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
  createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog | undefined>;
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

  async createMessage(message: InsertMessage): Promise<Message | undefined> {
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

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber | undefined> {
    const newSubscriber: Subscriber = {
      id: crypto.randomUUID(),
      phone_number: subscriber.phone_number,
      name: subscriber.name ?? null,
      status: subscriber.status ?? 'active',
      joined_at: new Date(),
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

  async getDeliveryLogs(filters?: {
    search?: string;
    status?: string;
    dateRange?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }> {
    return { logs: this.deliveryLogs, total: this.deliveryLogs.length };
  }

  async createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog | undefined> {
    const newLog: DeliveryLog = {
      id: crypto.randomUUID(),
      status: log.status ?? null,
      message_id: log.message_id ?? null,
      subscriber_id: log.subscriber_id ?? null,
      telnyx_message_id: log.telnyx_message_id ?? null,
      updated_at: new Date(),
      direction: log.direction ?? null,
      message_text: log.message_text ?? null,
    };
    this.deliveryLogs.push({ ...newLog, subscriber: null });
    return newLog;
  }

  async updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void> {
    const log = this.deliveryLogs.find(l => l.id === id);
    if (log) {
      log.status = status;
      log.updated_at = new Date();
      if (telnyxMessageId) log.telnyx_message_id = telnyxMessageId;
    }
  }

  async getDeliveryStats(): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    const stats = { totalSent: 0, delivered: 0, failed: 0, pending: 0 };
    stats.totalSent = this.deliveryLogs.length;
    stats.delivered = this.deliveryLogs.filter(l => l.status === 'delivered').length;
    stats.failed = this.deliveryLogs.filter(l => l.status === 'failed').length;
    stats.pending = this.deliveryLogs.filter(l => l.status === 'pending' || l.status === 'sent').length;
    return stats;
  }
}

export class FallbackStorage implements IStorage {
  private memoryStorage = new MemoryStorage();

  async getMessages(): Promise<Message[]> {
    // Fetch messages from Supabase
    const { data, error } = await supabase.from('messages').select('*');
    if (error) {
      console.error('Supabase error (getMessages):', error);
      return [];
    }
    return data ?? [];
  }

  async createMessage(message: InsertMessage): Promise<Message | undefined> {
    // Store message in Supabase
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          body: message.body,
          sent_at: now,
        },
      ])
      .select('*')
      .single();
    if (error) {
      console.error('Supabase error (createMessage):', error);
      return undefined;
    }
    return data;
  }

  async getMessageById(id: string): Promise<Message | undefined> {
    return await this.memoryStorage.getMessageById(id);
  }

  async getSubscribers(): Promise<Subscriber[]> {
    // Fetch subscribers from Supabase
    const { data, error } = await supabase.from('subscribers').select('*');
  console.log('SERVER LOG: Supabase getSubscribers response:', { data, error });
    if (error) {
      console.error('Supabase error:', error);
      return [];
    }
    return data ?? [];
  }

  async getActiveSubscribers(): Promise<Subscriber[]> {
    // Fetch active subscribers from Supabase
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .eq('status', 'active');
    if (error) {
      console.error('Supabase error (getActiveSubscribers):', error);
      return [];
    }
    return data ?? [];
  }

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber | undefined> {
    // If subscriber exists, update status to 'active' and updated_at
    const now = new Date().toISOString();
    const { data: existing, error: findError } = await supabase
      .from('subscribers')
      .select('*')
      .eq('phone_number', subscriber.phone_number)
      .single();
    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 = No rows found
      console.error('Supabase error (findSubscriber):', findError);
      return undefined;
    }
    if (existing) {
      // Update status and updated_at
      const { data, error } = await supabase
        .from('subscribers')
        .update({ status: 'active', updated_at: now })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) {
        console.error('Supabase error (updateSubscriber):', error);
        return undefined;
      }
      return data;
    } else {
      // Insert new subscriber
      const { data, error } = await supabase
        .from('subscribers')
        .insert([
          {
            ...subscriber,
            status: 'active',
            updated_at: now,
          },
        ])
        .select('*')
        .single();
      if (error) {
        console.error('Supabase error (createSubscriber):', error);
        return undefined;
      }
      return data;
    }
  }

  async deleteSubscriber(id: string): Promise<void> {
    // Set status to 'inactive' and update 'updated_at' (do not delete row)
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('subscribers')
      .update({ status: 'inactive', updated_at: now })
      .eq('id', id);
    if (error) {
      console.error('Supabase error (deleteSubscriber):', error);
    }
  }

  async getSubscriberByPhone(phoneNumber: string): Promise<Subscriber | undefined> {
    // Fetch subscriber from Supabase
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('Supabase error (getSubscriberByPhone):', error);
      return undefined;
    }
    return data ?? undefined;
  }

  async getDeliveryLogs(filters?: {
    search?: string;
    status?: string;
    dateRange?: string;
    limit?: number;
    offset?: number;
    message_id?: string;
  }): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }> {
    let query = supabase.from('delivery_logs').select('*', { count: 'exact' });
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.search) query = query.ilike('message_text', `%${filters.search}%`);
    if (filters?.message_id) query = query.eq('message_id', filters.message_id);
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset) query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 10) - 1);
    const { data, error, count } = await query;
    if (error) {
      console.error('Supabase error (getDeliveryLogs):', error);
      return { logs: [], total: 0 };
    }
    return { logs: data ?? [], total: count ?? 0 };
  }

  async createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog | undefined> {
    // Allow status to be 'failed', 'sent', etc.
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('delivery_logs')
      .insert([
        {
          ...log,
          updated_at: now,
        },
      ])
      .select('*')
      .single();
    if (error) {
      console.error('Supabase error (createDeliveryLog):', error);
      return undefined;
    }
    return data;
  }

  async updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void> {
    return await this.memoryStorage.updateDeliveryLogStatus(id, status, telnyxMessageId);
  }

  async getDeliveryStats(): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    return await this.memoryStorage.getDeliveryStats();
  }
}

// Export a default storage instance
export const storage: IStorage = new FallbackStorage();
