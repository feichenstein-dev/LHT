import { supabase } from "./lib/supabase";
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

// Supabase client is now used for all database operations

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
    export class DatabaseStorage implements IStorage {
      async getMessages(): Promise<Message[]> {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('sent_at', { ascending: false });
        if (error) throw error;
        return data || [];
      }

      async createMessage(message: InsertMessage): Promise<Message> {
        const { data, error } = await supabase
          .from('messages')
          .insert([message])
          .select();
        if (error) throw error;
        return data ? data[0] : null;
      }

      async getMessageById(id: string): Promise<Message | undefined> {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        return data || undefined;
      }

      async getSubscribers(): Promise<Subscriber[]> {
        const { data, error } = await supabase
          .from('subscribers')
          .select('*')
          .order('joined_at', { ascending: false });
        if (error) throw error;
        return data || [];
      }

      async getActiveSubscribers(): Promise<Subscriber[]> {
        const { data, error } = await supabase
          .from('subscribers')
          .select('*')
          .eq('status', 'active');
        if (error) throw error;
        return data || [];
      }

      async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber> {
        const { data, error } = await supabase
          .from('subscribers')
          .insert([subscriber])
          .select();
        if (error) throw error;
        return data ? data[0] : null;
      }

      async deleteSubscriber(id: string): Promise<void> {
        const { error } = await supabase
          .from('subscribers')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }

      async getSubscriberByPhone(phoneNumber: string): Promise<Subscriber | undefined> {
        const { data, error } = await supabase
          .from('subscribers')
          .select('*')
          .eq('phone_number', phoneNumber)
          .single();
        if (error) throw error;
        return data || undefined;
      }

      async getDeliveryLogs(filters: {
        search?: string;
        status?: string;
        dateRange?: string;
        limit?: number;
        offset?: number;
      } = {}): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }> {
        const { search, status, limit = 10, offset = 0 } = filters;
        let query = supabase
          .from('delivery_logs')
          .select('*,subscriber:subscribers(*)', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (search) {
          query = query.ilike('message_text', `%${search}%`);
        }
        if (status) {
          query = query.eq('status', status);
        }
        const { data, error, count } = await query;
        if (error) throw error;
        return { logs: data || [], total: count || 0 };
      }

      async createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog> {
        const { data, error } = await supabase
          .from('delivery_logs')
          .insert([log])
          .select();
        if (error) throw error;
        return data ? data[0] : null;
      }

      async updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void> {
        const updateData: any = { status, updated_at: new Date().toISOString() };
        if (telnyxMessageId) {
          updateData.telnyx_message_id = telnyxMessageId;
        }
        const { error } = await supabase
          .from('delivery_logs')
          .update(updateData)
          .eq('id', id);
        if (error) throw error;
      }

      async getDeliveryStats(): Promise<{
        totalSent: number;
        delivered: number;
        failed: number;
        pending: number;
      }> {
        const { data, error } = await supabase
          .from('delivery_logs')
          .select('status');
        if (error) throw error;
        const stats = { totalSent: 0, delivered: 0, failed: 0, pending: 0 };
        if (data) {
          stats.totalSent = data.length;
          stats.delivered = data.filter((l: any) => l.status === 'delivered').length;
          stats.failed = data.filter((l: any) => l.status === 'failed').length;
          stats.pending = data.filter((l: any) => ['pending', 'sent'].includes(l.status)).length;
        }
        return stats;
      }
    }
  // ...existing code...
      .insert([subscriber])
      .select();
    if (error) throw error;
    return data ? data[0] : null;
  }

  async deleteSubscriber(id: string): Promise<void> {
    const { error } = await supabase
      .from('subscribers')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async getSubscriberByPhone(phoneNumber: string): Promise<Subscriber | undefined> {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();
    if (error) throw error;
    return data || undefined;
  }

  async getDeliveryLogs(filters: {
    search?: string;
    status?: string;
    dateRange?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: (DeliveryLog & { subscriber: Subscriber | null })[], total: number }> {
    const { search, status, limit = 10, offset = 0 } = filters;
    let query = supabase
      .from('delivery_logs')
      .select('*,subscriber:subscribers(*)')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (search) {
      query = query.ilike('message_text', `%${search}%`);
    }
    if (status) {
      query = query.eq('status', status);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    return { logs: data || [], total: count || 0 };
  }

  async createDeliveryLog(log: InsertDeliveryLog): Promise<DeliveryLog> {
    const { data, error } = await supabase
      .from('delivery_logs')
      .insert([log])
      .select();
    if (error) throw error;
    return data ? data[0] : null;
  }

  async updateDeliveryLogStatus(id: string, status: string, telnyxMessageId?: string): Promise<void> {
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (telnyxMessageId) {
      updateData.telnyx_message_id = telnyxMessageId;
    }
    const { error } = await supabase
      .from('delivery_logs')
      .update(updateData)
      .eq('id', id);
    if (error) throw error;
  }

  async getDeliveryStats(): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    const { data, error } = await supabase
      .from('delivery_logs')
      .select('status');
    if (error) throw error;
    const stats = { totalSent: 0, delivered: 0, failed: 0, pending: 0 };
    if (data) {
      stats.totalSent = data.length;
      stats.delivered = data.filter((l: any) => l.status === 'delivered').length;
      stats.failed = data.filter((l: any) => l.status === 'failed').length;
      stats.pending = data.filter((l: any) => ['pending', 'sent'].includes(l.status)).length;
    }
    return stats;
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
