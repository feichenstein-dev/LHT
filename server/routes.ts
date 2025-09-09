import type { Express } from "express";
import { createServer, type Server } from "http";
import * as storageModule from "./storage";
const storage = storageModule.storage;
import { insertMessageSchema, insertSubscriberSchema } from "@shared/schema";
import { z } from "zod";


import Telnyx from 'telnyx';

// Centralized message sending and delivery log function
type SendMessageAndLogParams = {
  to: string;
  text: string;
  message_id?: string | null;
  name?: string | null;
  direction?: string;
  telnyx_message_id?: string | null;
  subscriber_id?: string | null;
  from?: string | null;
  messaging_profile_id?: string | null;
  webhook_url?: string | null;
  storage: any;
};

async function sendMessageAndLog({
  to,
  text,
  message_id = null,
  name = null,
  direction = 'outbound',
  telnyx_message_id = null,
  subscriber_id = null,
  from = null,
  messaging_profile_id = undefined,
  webhook_url = undefined,
  storage,
}: SendMessageAndLogParams) {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    throw new Error("TELNYX_API_KEY is not set in the environment variables.");
  }
  const telnyxNumber = from || process.env.TELNYX_PHONE_NUMBER;
  const profileId = messaging_profile_id || process.env.TELNYX_MESSAGING_PROFILE_ID;
  const webhookUrl = webhook_url || `${process.env.WEBHOOK_BASE_URL}`;
  let status = 'unknown';
  let error_message = null;
  let telnyxMsgId = null;


  // Pre-send phone number validation
  const phoneRegex = /^\+[1-9]\d{9,14}$/;
  if (!phoneRegex.test(to)) {
    status = 'invalid';
    error_message = 'Invalid phone number format';
    await storage.createDeliveryLog({
      message_id,
      phone_number: to,
      name,
      message_text: text,
      status,
      error_message,
      direction,
      telnyx_message_id: null,
      subscriber_id,
    });
    return { success: false, status, error: error_message, telnyx_message_id: null };
  }

  // Log the outgoing payload for debugging
  const payload = {
      from: telnyxNumber,
      to,
      text,
      webhook_url: webhookUrl,
      use_profile_webhooks: false,
    auto_detect: false,
    messaging_profile_id: profileId,
  };
  // Remove undefined fields (if any)
  Object.keys(payload).forEach(key => (payload as Record<string, any>)[key] === undefined && delete (payload as Record<string, any>)[key]);
  console.log('[sendMessageAndLog] Sending message with payload:', JSON.stringify(payload, null, 2));

  let telnyxResponse = null;
  let carrier = null;
  try {
    telnyxResponse = await new Telnyx(apiKey).messages.create(payload);
    // Log the full Telnyx API response for debugging
    console.log('[sendMessageAndLog] Telnyx API response:', JSON.stringify(telnyxResponse, null, 2));

    if (telnyxResponse.data && telnyxResponse.data.errors && telnyxResponse.data.errors.length > 0) {
      error_message = telnyxResponse.data.errors.map((e) => e.detail || e.title || JSON.stringify(e)).join('; ');
      const isBlocked = telnyxResponse.data.errors.some((e) => e.code === 'STOP_BLOCKED');
      status = isBlocked ? 'blocked' : 'failed';
      error_message = isBlocked ? 'Blocked until START' : error_message;
      telnyxMsgId = null;
    } else if (telnyxResponse.data && telnyxResponse.data.id) {
      status = 'sent';
      error_message = null;
      telnyxMsgId = telnyxResponse.data.id;
      // Set carrier for delivery log: outbound = to[0].carrier, inbound = from.carrier
      if (direction === 'outbound' && Array.isArray(telnyxResponse.data.to) && telnyxResponse.data.to.length > 0) {
        carrier = telnyxResponse.data.to[0].carrier || null;
      } else if (direction === 'inbound' && telnyxResponse.data.from && telnyxResponse.data.from.carrier) {
        carrier = telnyxResponse.data.from.carrier;
      }
    } else {
      status = 'failed';
      error_message = 'Telnyx response data is missing or invalid.';
      telnyxMsgId = null;
    }
  } catch (error) {
    // If no error_message, log as invalid and use error name
    let extraError = '';
    if (error && typeof error === 'object') {
      if ('raw' in error && (error as any).raw) {
        if ((error as any).raw.errors) {
          extraError += ' | raw.errors: ' + JSON.stringify((error as any).raw.errors);
        }
        if ((error as any).raw.responseBody) {
          extraError += ' | raw.responseBody: ' + (error as any).raw.responseBody;
        }
      }
      if ('responseBody' in error && (error as any).responseBody) {
        extraError += ' | responseBody: ' + (error as any).responseBody;
      }
    }
    if (!error_message) {
      status = 'invalid';
      if (error && typeof error === 'object' && 'type' in error && typeof (error as any).type === 'string') {
        error_message = (error as any).type + extraError;
      } else if (error && typeof error === 'object' && 'name' in error && typeof (error as any).name === 'string') {
        error_message = (error as any).name + extraError;
      } else {
        error_message = 'UnknownError' + extraError;
      }
    } else {
      error_message += extraError;
      status = 'failed';
    }
    telnyxMsgId = null;
    // Log the error object for debugging
    console.error('[sendMessageAndLog] Telnyx API error:', error);
    if (error && typeof error === 'object') {
      if ('raw' in error) {
        console.error('[sendMessageAndLog] Telnyx error.raw:', JSON.stringify((error as any).raw, null, 2));
        if ((error as any).raw && (error as any).raw.errors) {
          console.error('[sendMessageAndLog] Telnyx error.raw.errors:', JSON.stringify((error as any).raw.errors, null, 2));
        }
        if ((error as any).raw && (error as any).raw.responseBody) {
          console.error('[sendMessageAndLog] Telnyx error.raw.responseBody:', (error as any).raw.responseBody);
        }
      }
      if ('responseBody' in error) {
        console.error('[sendMessageAndLog] Telnyx error.responseBody:', (error as any).responseBody);
      }
    }
    if (error && typeof error === 'object') {
      if ('raw' in error) {
        console.error('[sendMessageAndLog] Telnyx error.raw:', JSON.stringify((error as any).raw, null, 2));
        if ((error as any).raw && (error as any).raw.errors) {
          console.error('[sendMessageAndLog] Telnyx error.raw.errors:', JSON.stringify((error as any).raw.errors, null, 2));
        }
        if ((error as any).raw && (error as any).raw.responseBody) {
          console.error('[sendMessageAndLog] Telnyx error.raw.responseBody:', (error as any).raw.responseBody);
        }
      }
      if ('responseBody' in error) {
        console.error('[sendMessageAndLog] Telnyx error.responseBody:', (error as any).responseBody);
      }
    }
    if (error && typeof error === 'object') {
      if ('raw' in error) {
        console.error('[sendMessageAndLog] Telnyx error.raw:', JSON.stringify((error as any).raw, null, 2));
        if ((error as any).raw && (error as any).raw.errors) {
          console.error('[sendMessageAndLog] Telnyx error.raw.errors:', JSON.stringify((error as any).raw.errors, null, 2));
        }
        if ((error as any).raw && (error as any).raw.responseBody) {
          console.error('[sendMessageAndLog] Telnyx error.raw.responseBody:', (error as any).raw.responseBody);
        }
      }
      if ('responseBody' in error) {
        console.error('[sendMessageAndLog] Telnyx error.responseBody:', (error as any).responseBody);
      }
    }
    if (telnyxResponse) {
      console.log('[sendMessageAndLog] Telnyx API response (in error):', JSON.stringify(telnyxResponse, null, 2));
    }
    // Log the outgoing payload again for error context
    //console.log('[sendMessageAndLog] Outgoing payload (in error):', JSON.stringify(payload, null, 2));
  }

  await storage.createDeliveryLog({
    message_id: message_id ?? undefined,
    phone_number: to,
    name: name ?? undefined,
    message_text: text,
    status,
    error_message,
    direction,
    telnyx_message_id: telnyxMsgId,
    subscriber_id: subscriber_id ?? undefined,
    carrier,
  });
  return { success: status === 'sent', status, error: error_message, telnyx_message_id: telnyxMsgId };
}

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
      let message = null;
      let messageId = null;
      let isRetry = false;
      // Only create a message and assign message_id if this is an LHT message send from the message page (req.body.IsLHMessage === true)
      if (req.body.message_id) {
        isRetry = true;
        console.log('[DEBUG] Incoming message_id for retry:', req.body.message_id, '| type:', typeof req.body.message_id);
        message = await storage.getMessageById(req.body.message_id);
        console.log('[DEBUG] getMessageById result:', message);
        if (!message) {
          throw new Error('Message not found for provided message_id');
        }
        messageId = message.id;
      } else if (req.body.IsLHMessage === true) {
        // Explicit LHT message send from messages page
      const messageData = insertMessageSchema.parse(req.body);
        message = await storage.createMessage(messageData);
      if (!message) {
        throw new Error('Failed to create message');
      }
        messageId = message.id;
      } else {
        // For all other cases (single send, retry, etc.), do not create a message or assign messageId
        message = null;
        messageId = null;
      }

      // Accept numbers (single or array) in the request body
      let numbers: string[] = [];
      if (Array.isArray(req.body.numbers)) {
        numbers = req.body.numbers;
      } else if (typeof req.body.numbers === 'string') {
        numbers = [req.body.numbers];
      }


      let recipients = [];
      if (numbers.length > 0) {
        // If numbers provided, fetch subscribers by those numbers (if possible)
        recipients = await Promise.all(numbers.map(async (num) => {
          const sub = await storage.getSubscriberByPhone(num);
          return sub || { phone_number: num, name: null, id: null };
        }));
      } else {
        // Default: all active subscribers
        recipients = await storage.getActiveSubscribers();
      }

      // Filter out invalid phone numbers before sending
      const phoneRegex = /^\+[1-9]\d{9,14}$/;
      recipients = recipients.filter(r => r.phone_number && phoneRegex.test(r.phone_number));

      if (!recipients || recipients.length === 0) {
        throw new Error('No valid recipients found');
      }

      const deliveryPromises = recipients.map(async (subscriber) => {
        const result = await sendMessageAndLog({
          to: subscriber.phone_number,
          text: message ? message.body : req.body.body,
          message_id: messageId,
          name: subscriber.name ?? null,
          direction: 'outbound',
          subscriber_id: subscriber.id ?? null,
          storage,
        });
        if (result.success) {
          console.log(`[Bulk Send] Success: ${subscriber.phone_number}`);
        } else {
          console.log(`[Bulk Send] Failure: ${subscriber.phone_number} | Error: ${result.error}`);
        }
        return { success: result.success, subscriber: subscriber.phone_number, error: result.error };
      });

      const results = await Promise.all(deliveryPromises);
      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      // Only update delivered_count if not a retry and message exists (i.e., bulk send from message page)
      if (!isRetry && message) {
        console.log(`Updating delivered_count for message ID ${messageId} with successCount: ${successCount}`);
        const { error: updateError } = await storageModule.supabase
          .from('messages')
          .update({ delivered_count: successCount })
          .eq('id', messageId);
        if (updateError) {
          console.error(`Failed to update delivered_count for message ID ${messageId}:`, updateError);
        } else {
          console.log(`Successfully updated delivered_count for message ID ${messageId}`);
        }
      }

      // Log the total and sent values to the delivery logs database
      await storageModule.supabase
        .from('delivery_logs')
        .insert({
          total_subscribers: recipients.length,
          sent_count: successCount,
          timestamp: new Date().toISOString(),
        });
      res.json({
        message,
        delivery: {
          total: recipients.length,
          sent: successCount,
          failed: failedCount,
          results,
        },
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
      let subscribers = await storage.getSubscribers() as Array<{ id: string; name: string | null; phone_number: string; joined_at: Date | null; status: string | null; carrier?: string }>;
      const apiKey = process.env.TELNYX_API_KEY;
      if (apiKey) {
        const telnyx = new Telnyx(apiKey);
        await Promise.all(subscribers.map(async (sub) => {
          try {
            // Telnyx number lookup API via REST (recommended)
            const fetch = (await import('node-fetch')).default;
            const resp = await fetch(`https://api.telnyx.com/v2/number_lookup/${encodeURIComponent(sub.phone_number)}`,
              {
                headers: { 'Authorization': `Bearer ${apiKey}` }
              }
            );
            const lookupResp = await resp.json();
            //console.log('number lookup response:', lookupResp);
            const lookup = lookupResp.data;
            //console.log('[Subscriber Carrier Lookup]', lookup);
            let normalizedCarrier = lookup.carrier && lookup.carrier.name ? lookup.carrier.name : '';
            let legalCarrier = lookup.carrier && lookup.carrier.full_name ? lookup.carrier.full_name : '';
            if (normalizedCarrier && normalizedCarrier.toLowerCase().includes('telnyx')) normalizedCarrier = '';
            if (legalCarrier && legalCarrier.toLowerCase().includes('telnyx')) legalCarrier = '';
            let carrier = null;
            if (normalizedCarrier && legalCarrier && normalizedCarrier !== legalCarrier) {
              carrier = `${normalizedCarrier} | ${legalCarrier}`;
            } else if (legalCarrier) {
              carrier = legalCarrier;
            } else if (normalizedCarrier) {
              carrier = normalizedCarrier;
            }
            if (carrier && carrier !== sub.carrier) {
              await storageModule.supabase
                .from('subscribers')
                .update({ carrier })
                .eq('id', sub.id);
              sub.carrier = carrier;
            }
          } catch (e) {
            // ignore lookup errors
          }
        }));
      }
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

      // Send welcome text if possible
      const apiKey = process.env.TELNYX_API_KEY;
      const telnyxNumber = process.env.TELNYX_PHONE_NUMBER;
      if (subscriber && apiKey && telnyxNumber) {
        const messageText = `Welcome! You are now subscribed to Sefer Chofetz Chaim Texts. Reply HELP for info or STOP to unsubscribe.`;
        try {
          await sendMessageAndLog({
            to: subscriber.phone_number,
            text: messageText,
            name: subscriber.name ?? null,
            direction: 'outbound',
            storage,
          });
        } catch (error) {
          console.error('[BACKEND] Failed to send welcome message to new subscriber:', error);
        }
      }

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
        let shouldSend = false;
        let messageText = "";
        if (normalizedStatus === "active" && (normalizedPrevStatus === "inactive" || normalizedPrevStatus === null || normalizedPrevStatus === undefined)) {
          shouldSend = true;
          messageText = `Welcome! You are now subscribed to Sefer Chofetz Chaim Texts. Reply HELP for info or STOP to unsubscribe.`;
        }
        if (normalizedStatus === "inactive" && normalizedPrevStatus === "active") {
          shouldSend = true;
          messageText = `You have been unsubscribed from Sefer Chofetz Chaim Texts. Reply START to subscribe again.`;
        }
        console.log(`[PATCH /api/subscribers/:id] Should send text?`, shouldSend, '| Message:', messageText);
        if (shouldSend) {
          try {
            await sendMessageAndLog({
              to: updatedSubscriber.phone_number,
              text: messageText,
              name: updatedSubscriber.name ?? null,
              direction: 'outbound',
              storage,
            });
          } catch (error) {
            console.error('[BACKEND] Failed to send status change message:', error);
          }
        }
      }

      res.json({ message: "Subscriber status updated successfully", subscriber: updatedSubscriber });
    } catch (error) {
      console.error("Error updating subscriber status:", error);
      res.status(500).json({ message: "Failed to update subscriber status" });
    }
  });

  app.patch("/api/subscribers/:id/name", async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({ message: "Invalid name value" });
        }

        const updatedSubscriber = await storage.updateSubscriberName(id, name.trim());

        if (!updatedSubscriber) {
            return res.status(404).json({ message: "Subscriber not found" });
        }

        res.json({ message: "Subscriber name updated successfully", subscriber: updatedSubscriber });
    } catch (error) {
        console.error("Error updating subscriber name:", error);
        res.status(500).json({ message: "Failed to update subscriber name" });
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
        const messageText = `You have been unsubscribed from Sefer Chofetz Chaim Texts. Reply JOIN with your name to subscribe again.`;
        try {
          await sendMessageAndLog({
            to: subscriber.phone_number,
            text: messageText,
            name: subscriber.name ?? null,
            direction: 'outbound',
            storage,
          });
        } catch (error) {
          console.error('[BACKEND] Failed to send unsubscribe message:', error);
        }
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

        // Enhance logs to include subscriber name if subscriber_id is missing
        const enhancedLogs = await Promise.all(
            (logs ?? []).map(async (log) => {
                if (!log.subscriber_id && log.phone_number) {
                    try {
                        const subscriber = await storage.getSubscriberByPhone(log.phone_number);
                        if (subscriber) {
                            log.name = subscriber.name;
                        }
                    } catch (error) {
                        console.error(`Error fetching subscriber for phone number ${log.phone_number}:`, error);
                    }
                }
                return log;
            })
        );

        res.json({
            logs: enhancedLogs,
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
          text,
          from
        } = data.payload;

        // delivery_status comes from the to[0].status if available, else 'unknown'
        let delivery_status = 'unknown';
        if (Array.isArray(to) && to.length > 0 && typeof to[0] === 'object' && 'status' in to[0]) {
          delivery_status = to[0].status;
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
          console.log('[BACKEND] Telnyx delivery status update for message sent from your number:', telnyxNumber, 'to', phone_number, '| Status:', delivery_status);
        }

        // Update the original delivery log row (status 'sent') to the final status
        // Try to match by phone_number, message_text, direction 'outbound', and status 'sent'
        console.log('[WEBHOOK DEBUG] phone_number:', phone_number);
        console.log('[WEBHOOK DEBUG] message_text:', text);
        console.log('[WEBHOOK DEBUG] status to write:', delivery_status);
        console.log('[WEBHOOK DEBUG] telnyx_message_id:', telnyxMessageId);
        console.log('[WEBHOOK DEBUG] error_message:', combinedError);
        console.log('[WEBHOOK DEBUG] direction: outbound');

        // Update the delivery log using the telnyx_message_id for precise matching
        console.log('[WEBHOOK DEBUG] Looking for log with telnyx_message_id:', telnyxMessageId);

        const { data: existingLogs, error: fetchError } = await storageModule.supabase
          .from('delivery_logs')
          .select('*')
          .eq('telnyx_message_id', telnyxMessageId);

        if (fetchError) {
          console.error('[WEBHOOK DEBUG] Error fetching existing logs:', fetchError);
        }

        if (existingLogs && existingLogs.length > 0) {
          // Always update ALL logs for this telnyx_message_id to the FINAL status
          for (const logToUpdate of existingLogs) {
            console.log('[WEBHOOK DEBUG] Found existing log to update:', logToUpdate.id);
            const { error: updateError, data: updateData } = await storageModule.supabase
              .from('delivery_logs')
              .update({
                delivery_status: delivery_status, // always set to the FINAL webhook status
                error_message: combinedError,
                updated_at: new Date().toISOString()
              })
              .eq('id', logToUpdate.id);
            console.log('[WEBHOOK DEBUG] supabase update result:', updateData, '| error:', updateError);
            if (updateError) {
              console.error('[BACKEND] Failed to update delivery log status:', updateError);
            } else {
              console.log('[BACKEND] Successfully updated delivery log with status:', delivery_status, '| Error:', combinedError);
            }
          }
        } else {
          console.log('[WEBHOOK DEBUG] No existing log found with telnyx_message_id:', telnyxMessageId);
          // Fallback: create a new log if no existing log is found
          await storage.createDeliveryLog({
            message_id: null,
            subscriber_id: subscriber ? subscriber.id : null,
            status: delivery_status,
            telnyx_message_id: telnyxMessageId,
            direction: "outbound",
            message_text: text,
            name,
            phone_number,
            error_message: combinedError
          });
          console.log('[BACKEND] Created new delivery log due to no existing log found with telnyx_message_id.');
        }
      } else if (data && data.event_type === "message.received") {
        const from = typeof data.payload.from === 'string' ? data.payload.from : data.payload.from?.phone_number;
        const text = data.payload.text;
        const telnyxMessageId = data.payload.id;
        const carrier = data.payload.from?.carrier || null;

        // Log if the inbound message is from your Telnyx number
        if (from === telnyxNumber) {
          console.warn('[BACKEND] Inbound SMS is from your own Telnyx number:', from);
        }
        console.log('[BACKEND] Inbound SMS received:');
        console.log('  From:', from);
        console.log('  Text:', text);
        console.log('  Telnyx Message ID:', telnyxMessageId);
        console.log('  Carrier:', carrier);
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
          telnyx_message_id: telnyxMessageId,
          carrier: carrier,
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
            const replyText = `Welcome! You are now subscribed to Sefer Chofetz Chaim Texts. Reply HELP for info or STOP to unsubscribe.`;
            console.log('[BACKEND] Sending JOIN reply to', from);
            try {
              await sendMessageAndLog({
                to: from,
                text: replyText,
                name: subscriber?.name ?? null,
                direction: 'outbound',
                storage,
              });
            } catch (error) {
              console.error('[BACKEND] Failed to send JOIN reply:', error);
            }
          }
        }
        // START keyword logic (unblock and send welcome)
        else if (startMatch) {
          // Unblock the subscriber in DB
          await storage.unblockSubscriber(from);
          // Send welcome message
          if (apiKey && telnyxNumber) {
            const replyText = `Welcome! You are now subscribed to Sefer Chofetz Chaim Texts. Reply HELP for info or STOP to unsubscribe.`;
            console.log('[BACKEND] Sending START reply to', from);
            try {
              await sendMessageAndLog({
                to: from,
                text: replyText,
                name: subscriber?.name ?? null,
                direction: 'outbound',
                storage,
              });
            } catch (error) {
              console.error('[BACKEND] Failed to send START reply:', error);
            }
          }
        }
        // HELP keyword logic
        else if (text.match(/^help$/i)) {
          if (apiKey && telnyxNumber) {
            const replyText = `You are currently subscribed to Sefer Chofetz Chaim Texts. Reply STOP to unsubscribe at any time. Reply JOIN with your name to subscribe again.`;
            console.log('[BACKEND] Sending HELP reply to', from);
            try {
              await sendMessageAndLog({
                to: from,
                text: replyText,
                name: subscriber?.name ?? null,
                direction: 'outbound',
                storage,
              });
            } catch (error) {
              console.error('[BACKEND] Failed to send HELP reply:', error);
            }
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
        // All other inbound messages: do nothing
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Error processing Telnyx webhook:", error);
      // Log webhook processing errors as delivery logs for debugging
      try {
        await storage.createDeliveryLog({
          message_id: null,
          subscriber_id: null,
          status: "webhook_error",
          direction: "system",
          message_text: `Webhook processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          name: null,
          phone_number: null,
          error_message: error instanceof Error ? error.stack : String(error),
        });
      } catch (logError) {
        console.error("Failed to log webhook processing error:", logError);
      }
      res.status(500).json({ message: "Failed to process webhook" });
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