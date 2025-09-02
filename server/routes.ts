import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMessageSchema, insertSubscriberSchema } from "@shared/schema";
import { z } from "zod";

import Telnyx from 'telnyx';

export async function registerRoutes(app: Express): Promise<Server> {
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
          // Create delivery log entry with pending status
          const deliveryLog = await storage.createDeliveryLog({
            message_id: message.id,
            subscriber_id: subscriber.id,
            status: "pending",
            direction: "outbound",
            message_text: message.body,
          });

          // Send SMS via Telnyx
          const telnyxClient = new Telnyx(process.env.TELNYX_API_KEY || '');
          const response = await telnyxClient.messages.create({
            from: process.env.TELNYX_PHONE_NUMBER || '+1234567890',
            to: subscriber.phone_number,
            text: message.body,
            webhook_url: `${process.env.WEBHOOK_BASE_URL || 'https://your-app.com'}/api/webhooks/telnyx`,
          } as any);

          // Update delivery log with Telnyx message ID
          await storage.updateDeliveryLogStatus(
            deliveryLog.id,
            "sent",
            response.data?.id
          );

          return { success: true, subscriber: subscriber.phone_number };
        } catch (error) {
          console.error(`Failed to send to ${subscriber.phone_number}:`, error);
          
          // Update delivery log with failed status
          await storage.createDeliveryLog({
            message_id: message.id,
            subscriber_id: subscriber.id,
            status: "failed",
            direction: "outbound",
            message_text: message.body,
          });

          return { success: false, subscriber: subscriber.phone_number, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      const results = await Promise.all(deliveryPromises);
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

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

      res.json({
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
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

  // Telnyx webhook endpoint for delivery status updates
  app.post("/api/webhooks/telnyx", async (req, res) => {
    try {
      const { data } = req.body;
      
      if (data && data.event_type === "message.finalized") {
        const { id: telnyxMessageId, to, delivery_status } = data.payload;
        
        // Find delivery log by Telnyx message ID
        const { logs } = await storage.getDeliveryLogs({
          search: telnyxMessageId,
          limit: 1,
        });
        
        if (logs.length > 0) {
          const log = logs[0];
          let status = "sent";
          
          switch (delivery_status) {
            case "delivered":
              status = "delivered";
              break;
            case "failed":
            case "undelivered":
              status = "failed";
              break;
            default:
              status = "sent";
          }
          
          await storage.updateDeliveryLogStatus(log.id, status);
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
