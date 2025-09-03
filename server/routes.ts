import type { Express } from "express";
import { createServer, type Server } from "http";
import * as storageModule from "./storage";
const storage = storageModule.storage;
import { insertMessageSchema, insertSubscriberSchema } from "@shared/schema";
import { z } from "zod";

import Telnyx from 'telnyx';

export async function registerRoutes(app: Express): Promise<Server> {
  // Retry message endpoint
  app.post("/api/retry-message", async (req, res) => {
    try {
      const { message_id, phone_number } = req.body;
      if (!message_id || !phone_number) {
        return res.status(400).json({ message: "Missing message_id or phone_number" });
      }
      // Fetch the message body from storage
      const message = await storage.getMessageById(message_id);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      const apiKey = process.env.TELNYX_API_KEY;
      const telnyxNumber = process.env.TELNYX_PHONE_NUMBER;
      if (!apiKey || !telnyxNumber) {
        return res.status(500).json({ message: "Missing Telnyx configuration" });
      }
      const telnyxClient = new Telnyx(apiKey);
      await telnyxClient.messages.create({
        from: telnyxNumber,
        to: phone_number,
        text: message.body,
        webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/telnyx`,
      } as any);
      // Log retry attempt as 'sent' (will be updated by webhook)
      await storage.createDeliveryLog({
        message_id,
        subscriber_id: null, // Could look up by phone_number if needed
        status: "sent",
        direction: "outbound",
        message_text: message.body,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error retrying message:", error);
      res.status(500).json({ message: "Failed to retry message" });
    }
  });
  // Messages endpoints
  app.get("/api/messages", async (req, res) => {
    try {
      console.log("Attempting to fetch messages...");
      const messages = await storage.getMessages();
      console.log("Successfully fetched messages:", messages.length);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ 
        message: "Failed to fetch messages", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage(messageData);
      
      // Get all active subscribers
      const activeSubscribers = await storage.getActiveSubscribers();
      
      if (activeSubscribers.length === 0) {
        return res.status(400).json({ message: "No active subscribers found" });
      }

      // Send SMS to each subscriber via Telnyx
      const deliveryPromises = activeSubscribers.map(async (subscriber) => {
        try {
          if (!message) throw new Error('Message is undefined');
          // Send SMS via Telnyx
          const apiKey = process.env.TELNYX_API_KEY;
          const phoneNumber = process.env.TELNYX_PHONE_NUMBER;
          if (!apiKey || !phoneNumber) {
            throw new Error(`Missing Telnyx configuration: API_KEY=${!!apiKey}, PHONE=${!!phoneNumber}`);
          }
          console.log(`Sending SMS to ${subscriber.phone_number} from ${phoneNumber}`);
          console.log(`API Key format: ${apiKey.substring(0, 10)}... (${apiKey.length} chars)`);
          // Check API key format
          if (!apiKey.startsWith('KEY')) {
            throw new Error(`Invalid Telnyx API key format. Must start with 'KEY'. Current format: ${apiKey.substring(0, 10)}... Get your key from https://portal.telnyx.com/#/app/api-keys`);
          }
          const telnyxClient = new Telnyx(apiKey);
          const response = await telnyxClient.messages.create({
            from: phoneNumber,
            to: subscriber.phone_number,
            text: message.body,
            webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/telnyx`,
          } as any);
          // Do not log delivery until webhook returns final status
          return { success: true, subscriber: subscriber.phone_number };
        } catch (error) {
          console.error(`Failed to send to ${subscriber.phone_number}:`, error);
          // Create delivery log with failed status
          if (message) {
            await storage.createDeliveryLog({
              message_id: message.id,
              subscriber_id: subscriber.id,
              status: "failed",
              direction: "outbound",
              message_text: message.body,
            });
          }
          return { success: false, subscriber: subscriber.phone_number, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      const results = await Promise.all(deliveryPromises);
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      // Log the actual results for debugging
      console.log(`Message delivery summary: ${successCount} sent, ${failedCount} failed`);
      results.forEach(result => {
        if (!result.success) {
          console.log(`Failed delivery to ${result.subscriber}: ${result.error}`);
        }
      });

      res.json({
        message,
        delivery: {
          total: activeSubscribers.length,
          sent: successCount,
          failed: failedCount,
          results
        }
      });
    } catch (error) {
      console.error("Error creating message:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid message data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create message" });
      }
    }
  });

  // Subscribers endpoints
  app.get("/api/subscribers", async (req, res) => {
    try {
      const subscribers = await storage.getSubscribers();
      res.json(subscribers);
    } catch (error) {
      console.error("Error fetching subscribers:", error);
      res.status(500).json({ message: "Failed to fetch subscribers" });
    }
  });

  app.post("/api/subscribers", async (req, res) => {
    try {
      const subscriberData = insertSubscriberSchema.parse(req.body);
      
      // Check if subscriber already exists
      const existing = await storage.getSubscriberByPhone(subscriberData.phone_number);
      if (existing) {
        return res.status(400).json({ message: "Subscriber with this phone number already exists" });
      }

      const subscriber = await storage.createSubscriber(subscriberData);
      res.json(subscriber);
    } catch (error) {
      console.error("Error creating subscriber:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid subscriber data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create subscriber" });
      }
    }
  });

  app.delete("/api/subscribers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteSubscriber(id);
      res.json({ message: "Subscriber deleted successfully" });
    } catch (error) {
      console.error("Error deleting subscriber:", error);
      res.status(500).json({ message: "Failed to delete subscriber" });
    }
  });

  // Delivery logs endpoints
  app.get("/api/delivery-logs", async (req, res) => {
    try {
      const { search, status, dateRange, page = "1", limit = "10" } = req.query;
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      const { logs, total } = await storage.getDeliveryLogs({
        search: search as string,
        status: status as string,
        dateRange: dateRange as string,
        limit: limitNum,
        offset,
      });

      // Patch: Always return logs and pagination in expected format
      res.json({
        logs: logs ?? [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total ?? 0,
          totalPages: Math.max(1, Math.ceil((total ?? 0) / limitNum)),
        },
      });
    } catch (error) {
      console.error("Error fetching delivery logs:", error);
      res.status(500).json({ message: "Failed to fetch delivery logs" });
    }
  });

  app.get("/api/delivery-stats", async (req, res) => {
    try {
      const stats = await storage.getDeliveryStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching delivery stats:", error);
      res.status(500).json({ message: "Failed to fetch delivery stats" });
    }
  });

  // Test Telnyx configuration endpoint
  app.get("/api/test-telnyx", async (req, res) => {
    try {
      const apiKey = process.env.TELNYX_API_KEY;
      const phoneNumber = process.env.TELNYX_PHONE_NUMBER;
      
      console.log("Testing Telnyx configuration...");
      
      if (apiKey) {
        console.log(`API Key format: ${apiKey.substring(0, 10)}... (${apiKey.length} chars)`);
      }
      
      if (!apiKey) {
        return res.status(400).json({ error: "TELNYX_API_KEY not set" });
      }
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "TELNYX_PHONE_NUMBER not set" });
      }
      
      // Check API key format
      if (!apiKey.startsWith('KEY')) {
        return res.status(400).json({ 
          error: "Invalid API key format. Telnyx API keys should start with 'KEY'",
          current: `${apiKey.substring(0, 10)}...`,
          hint: "Get your API key from https://portal.telnyx.com/#/app/api-keys"
        });
      }
      
      // Test authentication by making a simple API call
      const telnyxClient = new Telnyx(apiKey);
      console.log("Testing Telnyx authentication...");
      await telnyxClient.phoneNumbers.list({ page: { size: 1 } });
      
      res.json({ 
        status: "success", 
        message: "Telnyx configuration is valid",
        phoneNumber: phoneNumber,
        apiKeyFormat: `${apiKey.substring(0, 10)}...`
      });
    } catch (error: any) {
      console.error("Telnyx test error:", error);
      res.status(400).json({ 
        error: "Telnyx configuration failed",
        message: error.message,
        statusCode: error.statusCode || 'unknown',
        hint: "Check your TELNYX_API_KEY and ensure it's valid"
      });
    }
  });

  // Telnyx webhook endpoint for delivery status updates
  app.post("/api/webhooks/telnyx", async (req, res) => {
    try {
      console.log('Telnyx webhook received:', JSON.stringify(req.body, null, 2));
      const { data } = req.body;
      // Handle delivery status updates
      if (data && data.event_type === "message.finalized") {
        const { id: telnyxMessageId, to, delivery_status, text, from } = data.payload;
        // Only log when status is final
        let status = "sent";
        switch (delivery_status) {
          case "delivered": status = "delivered"; break;
          case "failed":
          case "undelivered": status = "failed"; break;
          default: status = "sent";
        }
        // Try to get name and phone number from Telnyx info
        let phone_number = "";
        let name = "";
        if (typeof to === "string") {
          phone_number = to;
        } else if (to && typeof to.phone_number === "string") {
          phone_number = to.phone_number;
        }
        if (from && typeof from.name === "string") {
          name = from.name;
        }
        await storage.createDeliveryLog({
          message_id: null, // If you have message_id, pass it here
          subscriber_id: null, // If you have subscriber_id, pass it here
          status,
          direction: "outbound",
          message_text: text,
        });
      }

      // Handle inbound SMS for joining
      if (data && data.event_type === "message.received") {
  const from = typeof data.payload.from === 'string' ? data.payload.from : data.payload.from?.phone_number;
        const text = data.payload.text;
        const joinMatch = text.match(/^join(.*)$/i);
        const stopMatch = text.match(/^stop$/i);
        let name: string | null = null;
        const apiKey = process.env.TELNYX_API_KEY;
        const telnyxNumber = process.env.TELNYX_PHONE_NUMBER;
        if (joinMatch) {
          name = joinMatch[1].trim();
          if (name === "") name = null;
          const existing = await storage.getSubscriberByPhone(from);
          if (!existing) {
            await storage.createSubscriber({ phone_number: from, name });
          } else {
            // If name is provided and different, update name and updated_at
            if (name && name !== existing.name) {
              const now = new Date().toISOString();
              // Use Supabase directly to update
              await storageModule.supabase
                .from('subscribers')
                .update({ name, updated_at: now })
                .eq('id', existing.id);
            }
            // If status is not active, reactivate
            if (existing.status !== 'active') {
              const now = new Date().toISOString();
              await storageModule.supabase
                .from('subscribers')
                .update({ status: 'active', updated_at: now })
                .eq('id', existing.id);
            }
          }
          // Log inbound join to delivery logs
          await storage.createDeliveryLog({
            message_id: null,
            subscriber_id: null,
            status: "received",
            direction: "inbound",
            message_text: text,
          });
          // Send welcome/help message
          if (apiKey && telnyxNumber) {
            const telnyxClient = new Telnyx(apiKey);
            await telnyxClient.messages.create({
              from: telnyxNumber,
              to: from,
              text: `Welcome! You are now subscribed to Lashon Hara Texts. Reply HELP for info or STOP to unsubscribe.`
            } as any);
          }
        }
        if (text.match(/^help$/i)) {
          if (apiKey && telnyxNumber) {
            const telnyxClient = new Telnyx(apiKey);
            await telnyxClient.messages.create({
              from: telnyxNumber,
              to: from,
              text: `You are currently subscribed to Lashon Hara Texts. Reply STOP to unsubscribe at any time. Reply JOIN with your name to subscribe again.`
            } as any);
          }
        }
        if (stopMatch) {
          const existing = await storage.getSubscriberByPhone(from);
          if (existing && existing.status === 'active') {
            await storage.deleteSubscriber(existing.id);
            // Send confirmation
            if (apiKey && telnyxNumber) {
              const telnyxClient = new Telnyx(apiKey);
              await telnyxClient.messages.create({
                from: telnyxNumber,
                to: from,
                text: `You have been unsubscribed. Reply JOIN with your name to subscribe again.`
              } as any);
            }
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Error processing Telnyx webhook:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
