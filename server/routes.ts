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

      // Pre-send phone number validation
      const phoneRegex = /^\+[1-9]\d{9,14}$/;
      if (!phoneRegex.test(phone_number)) {
        await storage.createDeliveryLog({
          message_id,
          phone_number,
          name: null, // Name can be added if available
          message_text: message.body,
          status: "invalid",
          error_message: "Invalid phone number format",
          direction: "outbound",
          telnyx_message_id: null,
        });
        return res.status(400).json({ message: "Invalid phone number format" });
      }

      try {
        const telnyxResponse = await new Telnyx(apiKey).messages.create({
          from: telnyxNumber,
          to: phone_number,
          text: message.body,
          webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/telnyx`,
        } as any);

        if (telnyxResponse.data && telnyxResponse.data.errors && telnyxResponse.data.errors.length > 0) {
          const errorMessage = telnyxResponse.data.errors.map((e: any) => e.detail || e.title || JSON.stringify(e)).join('; ');
          await storage.createDeliveryLog({
            message_id,
            phone_number,
            name: null, // Name can be added if available
            message_text: message.body,
            status: "failed",
            error_message: errorMessage,
            direction: "outbound",
            telnyx_message_id: null,
          });
          return res.status(500).json({ message: "Telnyx API error", error: errorMessage });
        }

        if (telnyxResponse.data && telnyxResponse.data.id) {
          // Log as sent; final status will be updated via webhook
          await storage.createDeliveryLog({
            message_id,
            phone_number,
            name: null, // Name can be added if available
            message_text: message.body,
            status: "sent",
            error_message: null,
            direction: "outbound",
            telnyx_message_id: telnyxResponse.data.id,
          });

          res.json({ success: true });
        } else {
          const errorMessage = "Telnyx response data is missing or invalid.";
          await storage.createDeliveryLog({
            message_id,
            phone_number,
            name: null, // Name can be added if available
            message_text: message.body,
            status: "failed",
            error_message: errorMessage,
            direction: "outbound",
            telnyx_message_id: null,
          });
          res.status(500).json({ message: errorMessage });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await storage.createDeliveryLog({
          message_id,
          phone_number,
          name: null, // Name can be added if available
          message_text: message.body,
          status: "failed",
          error_message: errorMessage,
          direction: "outbound",
          telnyx_message_id: null,
        });
        res.status(500).json({ message: "Failed to retry message", error: errorMessage });
      }
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
  let status = "unknown";
  let errorMsg = null;
  let phone_number = subscriber && subscriber.phone_number ? subscriber.phone_number : null;
  let name = subscriber && subscriber.name ? subscriber.name : null;
        try {
          if (!message) throw new Error('Message is undefined');
          const apiKey = process.env.TELNYX_API_KEY;
          const phoneNumber = process.env.TELNYX_PHONE_NUMBER;
          if (!apiKey || !phoneNumber) {
            errorMsg = `Missing Telnyx configuration: API_KEY=${!!apiKey}, PHONE=${!!phoneNumber}`;
            status = "failed";
            // Log to delivery log and terminal (only for config error)
            await storage.createDeliveryLog({
              phone_number: subscriber.phone_number,
              name: subscriber.name || null,
              message_text: message.body,
              status,
              error_message: errorMsg,
              direction: "outbound",
              telnyx_message_id: null,
            });
            console.error(`[BACKEND] FAILED: ${subscriber.phone_number} - ${errorMsg}`);
            throw new Error(errorMsg);
          }
          // Pre-send phone number validation (E.164, digits only, length 10-15, starts with '+')
          const phoneRegex = /^\+[1-9]\d{9,14}$/;
          if (!phoneRegex.test(subscriber.phone_number)) {
            errorMsg = `Invalid phone number format for ${subscriber.phone_number}. Must be E.164 (e.g. +12345678901).`;
            status = "invalid";
            // Log to delivery log and terminal (only for invalid numbers)
            await storage.createDeliveryLog({
              phone_number: subscriber.phone_number,
              name: subscriber.name || null,
              message_text: message.body,
              status,
              error_message: errorMsg,
              direction: "outbound",
              telnyx_message_id: null,
            });
            console.warn(`[BACKEND] INVALID: ${subscriber.phone_number} - ${errorMsg}`);
            throw new Error(errorMsg);
          }
          // Stricter check for obviously fake numbers (e.g. repeated digits)
          if (/^(\+)(\d)\2{6,}$/.test(subscriber.phone_number)) {
            errorMsg = `Suspicious/fake phone number detected: ${subscriber.phone_number}.`;
            status = "invalid";
            // Log to delivery log and terminal (only for invalid numbers)
            await storage.createDeliveryLog({
              phone_number: subscriber.phone_number,
              name: subscriber.name || null,
              message_text: message.body,
              status,
              error_message: errorMsg,
              direction: "outbound",
              telnyx_message_id: null,
            });
            console.warn(`[BACKEND] INVALID: ${subscriber.phone_number} - ${errorMsg}`);
            throw new Error(errorMsg);
          }
          // Warn for other suspicious numbers (e.g. +111111111111)
          if (/^\+1{5,}$/.test(subscriber.phone_number)) {
            console.warn(`[BACKEND] WARNING: Suspicious phone number detected: ${subscriber.phone_number}`);
          }
          console.log(`[BACKEND] Attempting to send SMS to ${subscriber.phone_number}`);
          // ...existing code for message length, encoding, limits...
          const messageLength = message.body.length;
          const containsHebrew = /[\u0590-\u05FF]/.test(message.body);
          const maxParts = 10;
          const maxCharactersPerPart = containsHebrew ? 67 : 153;
          const maxCharacters = maxParts * maxCharactersPerPart;
          if (messageLength > maxCharacters) {
            errorMsg = `Message exceeds the Telnyx limit of ${maxCharacters} characters. Cannot send.`;
            status = "failed";
            throw new Error(errorMsg);
          }
          const msgPayload = {
            from: phoneNumber,
            to: subscriber.phone_number,
            text: message.body,
            webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/telnyx`
          };
          console.log(`[BACKEND] Telnyx payload for ${subscriber.phone_number}:`, JSON.stringify(msgPayload, null, 2));
          try {
            const telnyxResponse = await new Telnyx(apiKey).messages.create(msgPayload as any);
            if (telnyxResponse.data && telnyxResponse.data.errors && telnyxResponse.data.errors.length > 0) {
              errorMsg = `Telnyx blocked the message to ${subscriber.phone_number}: ${JSON.stringify(telnyxResponse.data.errors, null, 2)}`;
              status = "failed";
              throw new Error(errorMsg);
            }
            // If no errors, log as sent
            status = "sent";
            errorMsg = null;
            console.log(`[BACKEND] Telnyx accepted message to ${subscriber.phone_number}: marked as SENT (awaiting webhook)`);
          } catch (error) {
            if (!errorMsg) {
              if (error && typeof error === 'object' && 'raw' in error && error.raw && typeof error.raw === 'object') {
                const raw = error.raw as any;
                if (Array.isArray(raw.errors) && raw.errors.length > 0) {
                  errorMsg = raw.errors.map((e: any) => e.detail || e.title || JSON.stringify(e)).join('; ');
                } else if (raw.errors) {
                  errorMsg = JSON.stringify(raw.errors);
                } else {
                  errorMsg = JSON.stringify(raw);
                }
              } else if (error instanceof Error) {
                errorMsg = error.message;
              } else {
                errorMsg = 'Unknown error';
              }
              status = "failed";
            }
            console.error(`[BACKEND] Telnyx API Error (BULK): ${errorMsg}`);
          }
        } catch (error) {
          if (!errorMsg) {
            if (error && typeof error === 'object' && 'raw' in error && error.raw && typeof error.raw === 'object') {
              const raw = error.raw as any;
              if (Array.isArray(raw.errors) && raw.errors.length > 0) {
                errorMsg = raw.errors.map((e: any) => e.detail || e.title || JSON.stringify(e)).join('; ');
              } else if (raw.errors) {
                errorMsg = JSON.stringify(raw.errors);
              } else {
                errorMsg = JSON.stringify(raw);
              }
            } else if (error instanceof Error) {
              errorMsg = error.message;
            } else {
              errorMsg = 'Unknown error';
            }
            status = status === "unknown" ? "failed" : status;
          }
        }
        // Do not create delivery log here for sent messages; only after webhook or timeout
        if (status === "sent") {
          // Schedule a fallback to create an 'invalid' delivery log if no webhook in 1 minute
          if (message && message.body) {
            setTimeout(async () => {
              // Check if a delivery log exists for this message/phone with status delivered/failed
              const { data: logs, error: fetchError } = await storageModule.supabase
                .from('delivery_logs')
                .select('*')
                .eq('phone_number', phone_number)
                .eq('message_text', message.body)
                .eq('direction', 'outbound');
              const hasFinal = logs && logs.some((log: any) => log.status === 'delivered' || log.status === 'failed');
              if (!hasFinal) {
                await storage.createDeliveryLog({
                  phone_number: phone_number,
                  name: name,
                  message_text: message.body,
                  status: 'invalid',
                  error_message: 'No webhook received from Telnyx after 1 minute',
                  direction: 'outbound',
                  telnyx_message_id: null,
                });
                console.warn(`[BACKEND] Fallback: Marked as INVALID for ${phone_number} (no webhook after 1 minute)`);
              }
            }, 60000);
          }
        }
        return { success: status === "sent", subscriber: phone_number, error: errorMsg };
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

      // Update the delivered_count field in the messages table
      if (message) {
        console.log(`Updating delivered_count for message ID ${message.id} with successCount: ${successCount}`);
        const { error: updateError } = await storageModule.supabase
          .from('messages')
          .update({ delivered_count: successCount })
          .eq('id', message.id);
        if (updateError) {
          console.error(`Failed to update delivered_count for message ID ${message.id}:`, updateError);
        } else {
          console.log(`Successfully updated delivered_count for message ID ${message.id}`);
        }
      }

      // Log the total and sent values to the delivery logs database
      await storageModule.supabase
        .from('delivery_logs')
        .insert({
          total_subscribers: activeSubscribers.length,
          sent_count: successCount,
          timestamp: new Date().toISOString(),
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
        res.status(400).json({ message: "invalid message data", errors: error.errors });
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
        res.status(400).json({ message: "invalid subscriber data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create subscriber" });
      }
    }
  });

  app.patch("/api/subscribers/:id", async (req, res) => {
    console.log("[PATCH /api/subscribers/:id] Endpoint triggered");
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || (status !== "active" && status !== "inactive")) {
        return res.status(400).json({ message: "invalid status value" });
      }

      // Fetch the current subscriber to check previous status
      let prevStatus = null;
      try {
        const allSubscribers = await storage.getSubscribers();
        const currentSubscriber = allSubscribers.find((s) => String(s.id) === String(id));
        prevStatus = currentSubscriber ? currentSubscriber.status : null;
      } catch (e) {
        console.error('Failed to fetch current subscriber for status check:', e);
      }

      // Normalize status values for comparison
      const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
      const normalizedPrevStatus = typeof prevStatus === 'string' ? prevStatus.toLowerCase() : prevStatus;

      // Logging after id and status are defined
      console.log(`[PATCH /api/subscribers/:id] Requested status change for subscriber ID:`, id);
      console.log(`[PATCH /api/subscribers/:id] Previous status:`, normalizedPrevStatus, '| New status:', normalizedStatus);

      const updatedSubscriber = await storage.updateSubscriberStatus(id, status);

      if (!updatedSubscriber) {
        return res.status(404).json({ message: "Subscriber not found" });
      }

      // Only send welcome text if reactivated (inactive -> active)
      const apiKey = process.env.TELNYX_API_KEY;
      const telnyxNumber = process.env.TELNYX_PHONE_NUMBER;

      if (apiKey && telnyxNumber) {
        const telnyxClient = new Telnyx(apiKey);
        let shouldSend = false;
        let messageText = "";
        // Send welcome text if new or reactivated (prevStatus is null/undefined/inactive -> active)
        if (normalizedStatus === "active" && (normalizedPrevStatus === "inactive" || normalizedPrevStatus === null || normalizedPrevStatus === undefined)) {
          shouldSend = true;
          messageText = `Welcome! You are now subscribed to Sefer Chofetz Chaim Texts. Reply HELP for info or STOP to unsubscribe.`;
        }
        // Send unsubscribe text if deactivated (active -> inactive)
        if (normalizedStatus === "inactive" && normalizedPrevStatus === "active") {
          shouldSend = true;
          messageText = `You have been unsubscribed from Sefer Chofetz Chaim Texts. Reply START to subscribe again.`;
        }
        console.log(`[PATCH /api/subscribers/:id] Should send text?`, shouldSend, '| Message:', messageText);
        if (shouldSend) {
          try {
            const telnyxResult = await telnyxClient.messages.create({
              from: telnyxNumber,
              to: updatedSubscriber.phone_number,
              text: messageText,
            } as any);
            console.log(`[PATCH /api/subscribers/:id] Telnyx API response:`, JSON.stringify(telnyxResult, null, 2));
          } catch (err) {
            console.error(`[PATCH /api/subscribers/:id] Telnyx API error:`, err);
            // Log delivery as invalid if Telnyx API error
            await storage.createDeliveryLog({
              phone_number: updatedSubscriber.phone_number,
              name: updatedSubscriber.name || null,
              message_text: messageText,
              status: 'invalid',
              error_message: err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err),
              direction: 'outbound',
              telnyx_message_id: null,
            });
          }
          // Do not log delivery here; will be logged by webhook handler
        }
      }

      res.json({ message: "Subscriber status updated successfully", subscriber: updatedSubscriber });
    } catch (error) {
      console.error("Error updating subscriber status:", error);
      res.status(500).json({ message: "Failed to update subscriber status" });
    }
  });

  app.delete("/api/subscribers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // Fetch subscriber before deleting for phone number and name
      let subscriber = null;
      try {
        const allSubscribers = await storage.getSubscribers();
        subscriber = allSubscribers.find((s) => String(s.id) === String(id));
      } catch (e) {
        console.error('Failed to fetch subscriber before delete:', e);
      }

      // Send unsubscribe SMS if possible
      const apiKey = process.env.TELNYX_API_KEY;
      const telnyxNumber = process.env.TELNYX_PHONE_NUMBER;
      if (subscriber && apiKey && telnyxNumber) {
        const telnyxClient = new Telnyx(apiKey);
        const messageText = `You have been unsubscribed from Sefer Chofetz Chaim Texts. Reply JOIN with your name to subscribe again.`;
        try {
          const telnyxResult = await telnyxClient.messages.create({
            from: telnyxNumber,
            to: subscriber.phone_number,
            text: messageText,
          } as any);
          console.log(`[DELETE /api/subscribers/:id] Telnyx API response:`, JSON.stringify(telnyxResult, null, 2));
        } catch (err) {
          console.error(`[DELETE /api/subscribers/:id] Telnyx API error:`, err);
          // Log delivery as invalid if Telnyx API error
          await storage.createDeliveryLog({
            phone_number: subscriber.phone_number,
            name: subscriber.name || null,
            message_text: messageText,
            status: 'invalid',
            error_message: err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err),
            direction: 'outbound',
            telnyx_message_id: null,
          });
        }
        // Do not log delivery here; will be logged by webhook handler
      }

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
          error: "invalid API key format. Telnyx API keys should start with 'KEY'",
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
      const telnyxNumber = process.env.TELNYX_PHONE_NUMBER;
      const apiKey = process.env.TELNYX_API_KEY;
      console.log('========== Telnyx Webhook Received ==========');
      console.log('[BACKEND] Raw webhook body:', JSON.stringify(req.body, null, 2));
      const { data } = req.body;
      if (data) {
        console.log('[BACKEND] Webhook event_type:', data.event_type);
        if (data.payload) {
          console.log('[BACKEND] Webhook payload:', JSON.stringify(data.payload, null, 2));
        }
      }

      if (data && data.event_type === "message.finalized") {
        console.log('Processing message.finalized webhook...');
        const {
          id: telnyxMessageId,
          to,
          delivery_status,
          text,
          from
        } = data.payload;

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

        let phone_number = "";
        let name = null;

        if (typeof to === "string") {
          phone_number = to;
        } else if (to && typeof to.phone_number === "string") {
          phone_number = to.phone_number;
        }

        if (from && typeof from.name === "string") {
          name = from.name;
        }

        // Fetch subscriber details if available
        const subscriber = await storage.getSubscriberByPhone(phone_number);
        if (subscriber) {
          name = subscriber.name;
        }

        // Extract error code and message if present
        let errorMessage = null;
        let errorCode = null;
        if (data.payload.errors && Array.isArray(data.payload.errors) && data.payload.errors.length > 0) {
          errorMessage = data.payload.errors.map((e: any) => e.detail || e.title || JSON.stringify(e)).join('; ');
          errorCode = data.payload.errors.map((e: any) => e.code || '').filter(Boolean).join('; ');
        } else if (data.payload.error_code) {
          errorCode = data.payload.error_code;
        }
        let combinedError = null;
        if (errorCode && errorMessage) {
          combinedError = `Code: ${errorCode} | Message: ${errorMessage}`;
        } else if (errorCode) {
          combinedError = `Code: ${errorCode}`;
        } else if (errorMessage) {
          combinedError = errorMessage;
        }

        // Log delivery status updates for messages sent from your Telnyx number
        if (typeof from === 'string' && from === telnyxNumber) {
          console.log('[BACKEND] Telnyx delivery status update for message sent from your number:', telnyxNumber, 'to', phone_number, '| Status:', status);
        }

        // Update the original delivery log row (status 'sent') to the final status
        // Try to match by phone_number and message_text, and status 'sent'
        // If you have message_id or telnyx_message_id, you can use those as well
        console.log('[BACKEND] Attempting to update delivery log for phone:', phone_number, '| message_text:', text);
        console.log('[BACKEND] Writing status:', status, '| Error:', combinedError);
        const { error: updateError } = await storageModule.supabase
          .from('delivery_logs')
          .update({
            status,
            telnyx_message_id: telnyxMessageId,
            error_message: combinedError
          })
          .match({
            phone_number,
            message_text: text,
            status: 'sent',
            direction: 'outbound'
          });

        if (updateError) {
          console.error('[BACKEND] Failed to update delivery log status:', updateError);
          // Optionally, fall back to inserting a new log if update fails
          await storage.createDeliveryLog({
            message_id: null, // If you have message_id, pass it here
            subscriber_id: subscriber ? subscriber.id : null,
            status,
            telnyx_message_id: telnyxMessageId,
            direction: "outbound",
            message_text: text,
            name,
            phone_number,
            error_message: combinedError
          });
          console.log('[BACKEND] Inserted new delivery log due to update failure.');
        } else {
          console.log('[BACKEND] Updated delivery log with status:', status, '| Error:', combinedError);
        }
      }

      if (data && data.event_type === "message.received") {
        const from = typeof data.payload.from === 'string' ? data.payload.from : data.payload.from?.phone_number;
        const text = data.payload.text;
        // Log if the inbound message is from your Telnyx number
        if (from === telnyxNumber) {
          console.warn('[BACKEND] Inbound SMS is from your own Telnyx number:', from);
        }
        console.log('[BACKEND] Inbound SMS received:');
        console.log('  From:', from);
        console.log('  Text:', text);
        console.log('  Full payload:', JSON.stringify(data.payload, null, 2));
        const joinMatch = text.match(/^join(.*)$/i);
        const stopMatch = text.match(/^stop$/i);
        const startMatch = text.match(/^start$/i);
        let name = null;
        let subscriber = await storage.getSubscriberByPhone(from);

        // Always log the inbound message ONCE, before any keyword logic
        await storage.createDeliveryLog({
          message_id: null,
          subscriber_id: subscriber ? subscriber.id : null,
          status: "received",
          direction: "inbound",
          message_text: text,
          name: subscriber ? subscriber.name : null,
          phone_number: from,
        });

        // JOIN keyword logic
        if (joinMatch) {
          name = joinMatch[1].trim();
          if (name === "") name = null;
          if (!subscriber) {
            await storage.createSubscriber({ phone_number: from, name });
            subscriber = await storage.getSubscriberByPhone(from);
          } else {
            if (name && name !== subscriber.name) {
              const now = new Date().toISOString();
              await storageModule.supabase
                .from('subscribers')
                .update({ name, updated_at: now })
                .eq('id', subscriber.id);
              subscriber = await storage.getSubscriberByPhone(from);
            }
            if (subscriber && subscriber.status !== 'active') {
              const now = new Date().toISOString();
              await storageModule.supabase
                .from('subscribers')
                .update({ status: 'active', updated_at: now })
                .eq('id', subscriber.id);
              subscriber = await storage.getSubscriberByPhone(from);
            }
          }
          // Log the welcome reply (outbound)
          if (apiKey && telnyxNumber) {
            const telnyxClient = new Telnyx(apiKey);
            const replyText = `Welcome! You are now subscribed to Sefer Chofetz Chaim Texts. Reply HELP for info or STOP to unsubscribe.`;
            console.log('[BACKEND] Sending JOIN reply to', from);
            try {
              const telnyxResponse = await telnyxClient.messages.create({
                from: telnyxNumber,
                to: from,
                text: replyText
              } as any);
              console.log('[BACKEND] Telnyx API Outbound Response (JOIN):', JSON.stringify(telnyxResponse, null, 2));
            } catch (err) {
              console.error('[BACKEND] Telnyx API Error (JOIN):', err);
              await storage.createDeliveryLog({
                phone_number: from,
                name: subscriber?.name || null,
                message_text: replyText,
                status: 'invalid',
                error_message: err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err),
                direction: 'outbound',
                telnyx_message_id: null,
              });
            }
            // Do not log delivery here; will be logged by webhook handler
          }
        }
        // START keyword logic (unblock and send welcome)
        else if (startMatch) {
          // Unblock the subscriber in DB
          await storage.unblockSubscriber(from);
          // Send welcome message
          if (apiKey && telnyxNumber) {
            const telnyxClient = new Telnyx(apiKey);
            const replyText = `Welcome! You are now subscribed to Sefer Chofetz Chaim Texts. Reply HELP for info or STOP to unsubscribe.`;
            console.log('[BACKEND] Sending START reply to', from);
            try {
              const telnyxResponse = await telnyxClient.messages.create({
                from: telnyxNumber,
                to: from,
                text: replyText
              } as any);
              console.log('[BACKEND] Telnyx API Outbound Response (START):', JSON.stringify(telnyxResponse, null, 2));
            } catch (err) {
              console.error('[BACKEND] Telnyx API Error (START):', err);
              await storage.createDeliveryLog({
                phone_number: from,
                name: subscriber?.name || null,
                message_text: replyText,
                status: 'invalid',
                error_message: err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err),
                direction: 'outbound',
                telnyx_message_id: null,
              });
            }
            // Do not log delivery here; will be logged by webhook handler
          }
        }
        // HELP keyword logic
        else if (text.match(/^help$/i)) {
          if (apiKey && telnyxNumber) {
            const telnyxClient = new Telnyx(apiKey);
            const replyText = `You are currently subscribed to Sefer Chofetz Chaim Texts. Reply STOP to unsubscribe at any time. Reply JOIN with your name to subscribe again.`;
            console.log('[BACKEND] Sending HELP reply to', from);
            try {
              const telnyxResponse = await telnyxClient.messages.create({
                from: telnyxNumber,
                to: from,
                text: replyText
              } as any);
              console.log('[BACKEND] Telnyx API Outbound Response (HELP):', JSON.stringify(telnyxResponse, null, 2));
            } catch (err) {
              console.error('[BACKEND] Telnyx API Error (HELP):', err);
              await storage.createDeliveryLog({
                phone_number: from,
                name: subscriber?.name || null,
                message_text: replyText,
                status: 'invalid',
                error_message: err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err),
                direction: 'outbound',
                telnyx_message_id: null,
              });
            }
            // Do not log delivery here; will be logged by webhook handler
          }
        }
        // STOP keyword logic
        else if (stopMatch) {
          let wasActive = subscriber && subscriber.status === 'active';
          if (wasActive) {
            if (subscriber) {
              // Set status to 'blocked' instead of deleting
              await storage.updateSubscriberStatus(subscriber.id, 'blocked');
            }
          }
          // Do not send or log any outbound message after STOP. Let carrier handle auto-reply if enabled.
          // TIP: If you want to avoid carrier-level blocks, use a custom keyword like "PAUSE" instead of "STOP". In your logic, handle "pause" by setting the subscriber status to "paused" and do not send any more messages until they text "resume". This way, you keep control and avoid the carrier's opt-out system.
        }
        // All other inbound messages
        else {
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
  console.error("Error processing Telnyx webhook:", error);
  res.status(500).json({ message: "Failed to process webhook" });
  console.log('========== End Telnyx Webhook ==========');
  console.log('========== End Telnyx Webhook ==========');
    }
  });

  // Login endpoint
  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    const envEmail = process.env.LOGIN_USERNAME;
    const envPassword = process.env.LOGIN_PASSWORD;
    if (!envEmail || !envPassword) {
      return res.status(500).json({ error: "Login credentials not set in .env" });
    }
    if (email === envEmail && password === envPassword) {
      return res.json({ success: true });
    } else {
      return res.status(401).json({ error: "invalid email or password" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
