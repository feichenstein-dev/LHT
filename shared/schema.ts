import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  body: text("body").notNull(),
  sent_at: timestamp("sent_at", { withTimezone: true }).default(sql`now()`),
});

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  phone_number: text("phone_number").notNull().unique(),
  name: text("name"),
  joined_at: timestamp("joined_at", { withTimezone: true }).default(sql`now()`),
  status: text("status").default("active"),
});

export const delivery_logs = pgTable("delivery_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  message_id: uuid("message_id").references(() => messages.id),
  subscriber_id: uuid("subscriber_id").references(() => subscribers.id),
  status: text("status"),
  telnyx_message_id: text("telnyx_message_id"),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
  direction: text("direction"),
  message_text: text("message_text"),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  sent_at: true,
});

export const insertSubscriberSchema = createInsertSchema(subscribers).omit({
  id: true,
  joined_at: true,
});

export const insertDeliveryLogSchema = createInsertSchema(delivery_logs).omit({
  id: true,
  updated_at: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type InsertDeliveryLog = z.infer<typeof insertDeliveryLogSchema>;

export type Message = typeof messages.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type DeliveryLog = typeof delivery_logs.$inferSelect;
