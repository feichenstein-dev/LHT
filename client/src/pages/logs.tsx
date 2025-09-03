import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatPhoneNumber } from "@/lib/supabase";
import { ChevronDown, Eye } from "lucide-react";
import { RotateCcw } from "lucide-react";
import type { DeliveryLog, Subscriber } from "@shared/schema";

export default function Logs() {
  // ...existing code...
  const { data: logsData, isLoading } = useQuery({
    queryKey: ["/api/delivery-logs", "all"],
    queryFn: async () => {
      const response = await fetch("/api/delivery-logs?limit=10000&page=1");
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json();
    },
  });
  const logs = logsData?.logs || [];

  // Dynamic status options for outbound delivery logs
  const statusOptions = Array.from(
    new Set(
      logs
        .filter((log: any) => log.direction === 'outbound')
        .map((log: any) => log.status)
        .filter(Boolean)
    )
  );

  // Filters
  const [filterText, setFilterText] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedMsgId, setExpandedMsgId] = useState<string|null>(null);
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');


  // Fetch messages for dropdown and joining
  const { data: messagesData, isLoading: isMessagesLoading } = useQuery({
    queryKey: ["/api/messages"],
    queryFn: async () => {
      const response = await fetch("/api/messages");
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    select: (msgs) => [...msgs].sort((a, b) => new Date(b.sent_at || '').getTime() - new Date(a.sent_at || '').getTime()),
  });

  // Fetch subscribers for joining
  const { data: subscribersData } = useQuery({
    queryKey: ["/api/subscribers"],
    queryFn: async () => {
      const response = await fetch("/api/subscribers");
      if (!response.ok) throw new Error("Failed to fetch subscribers");
      return response.json();
    },
  });

  // Aggregate logs by message_id, join with subscribers for name/phone
  let filteredMessages: any[] = [];
  let messageDropdownOptions: any[] = [];
  if (direction === 'outbound' && messagesData) {
    const messages = messagesData.map((msg: any) => {
      const msgLogs = logs.filter((log: any) => log.message_id === msg.id).map((log: any) => {
        let subscriber = null;
        if (subscribersData) {
          subscriber = subscribersData.find((sub: any) => sub.id === log.subscriber_id);
        }
        return {
          ...log,
          subscriber_name: subscriber?.name || "N/A",
          subscriber_phone: subscriber?.phone_number || log.subscriber_id || "N/A",
        };
      });
      return {
        message_id: msg.id,
        message_text: msg.body,
        sent_at: msg.sent_at,
        logs: msgLogs,
      };
    });
    filteredMessages = messages;
    messageDropdownOptions = messages.map((msg: any) => ({
      value: msg.message_text,
      label: msg.message_text,
      date: msg.sent_at ? new Date(msg.sent_at).toLocaleDateString() : "",
    }));
  } else if (direction === 'inbound') {
    const inboundLogs = logs.filter((log: any) => log.direction === 'inbound').map((log: any) => {
      let subscriber = null;
      if (subscribersData) {
        subscriber = subscribersData.find((sub: any) => sub.id === log.subscriber_id);
      }
      return {
        ...log,
        name: subscriber?.name || log.name || "",
        phone_number: subscriber?.phone_number || log.phone_number || "",
      };
    });
    const grouped: Record<string, any> = {};
    inboundLogs.forEach((log: any) => {
      if (log.status === 'pending') return;
      if (!grouped[log.message_text]) {
        grouped[log.message_text] = {
          message_text: log.message_text,
          logs: [],
        };
      }
      grouped[log.message_text].logs.push(log);
    });
    filteredMessages = Object.values(grouped);
    messageDropdownOptions = Object.values(grouped).map((msg: any) => ({
      value: msg.message_text,
      label: msg.message_text,
      date: '',
    }));
  }

  // Aggregate logs by message_id, join with subscribers for name/phone
  let messages: any[] = [];
  if (messagesData) {
    messages = messagesData.map((msg: any) => {
      const msgLogs = logs.filter((log: any) => log.message_id === msg.id).map((log: any) => {
        let subscriber = null;
        if (subscribersData) {
          subscriber = subscribersData.find((sub: any) => sub.id === log.subscriber_id);
        }
        return {
          ...log,
          subscriber_name: subscriber?.name || "N/A",
          subscriber_phone: subscriber?.phone_number || log.subscriber_id || "N/A",
        };
      });
      return {
        message_id: msg.id,
        message_text: msg.body,
        sent_at: msg.sent_at,
        logs: msgLogs,
      };
    });
  } else {
    // For inbound, aggregate by message_text, group all inbound logs
    const inboundLogs = logs.filter((log: any) => log.direction === 'inbound').map((log: any) => {
      let subscriber = null;
      if (subscribersData) {
        subscriber = subscribersData.find((sub: any) => sub.id === log.subscriber_id);
      }
      return {
        ...log,
        name: subscriber?.name || log.name || "",
        phone_number: subscriber?.phone_number || log.phone_number || "",
      };
    });
    const grouped: Record<string, any> = {};
    inboundLogs.forEach((log: any) => {
      // Only include logs with a final status (not pending)
      if (log.status === 'pending') return;
      if (!grouped[log.message_text]) {
        grouped[log.message_text] = {
          message_text: log.message_text,
          logs: [],
        };
      }
      grouped[log.message_text].logs.push(log);
    });
    filteredMessages = Object.values(grouped);
  }

  // Filter by message content
  if (filterText && filterText !== "all") {
    filteredMessages = filteredMessages.filter((msg: any) => msg.message_text === filterText);
  }

  // Filter by status
  if (filterStatus && filterStatus !== "all") {
    filteredMessages = filteredMessages.filter((msg: any) =>
      msg.logs.some((log: any) => log.status === filterStatus)
    );
  }

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gradient-to-b from-muted/30 to-muted/10 py-8 px-2">
      <Card className="w-full max-w-full mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Delivery Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 mb-6 w-full">
            <div className="flex flex-row gap-4 w-full">
              <Select
                value={direction}
                onValueChange={(v) => {
                  setDirection(v as 'outbound' | 'inbound');
                  setFilterText('all'); // Clear message filter when direction changes
                }}
              >
                <SelectTrigger className="w-40 h-12 text-base bg-muted rounded-2xl px-4">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterText} onValueChange={setFilterText}>
                <SelectTrigger className="w-full h-12 text-base bg-muted rounded-2xl px-4">
                  <SelectValue placeholder="Filter by message" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex justify-between items-center w-full">
                      <span>All Messages</span>
                    </div>
                  </SelectItem>
                  {messageDropdownOptions.map((opt, idx) => (
                    <SelectItem key={idx} value={opt.value}>
                      <div className="flex items-center w-full">
                        <span className="truncate max-w-[1200px]">{opt.label}</span>
                        <span className="flex-1" />
                        <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">{opt.date}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="bg-background rounded-xl shadow-md w-full overflow-x-auto" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {isLoading || isMessagesLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">Loading logs...</div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">No messages found.</div>
            ) : direction === 'outbound' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base font-semibold text-foreground">Message</TableHead>
                    <TableHead className="text-base font-semibold text-foreground">Sent At</TableHead>
                    {/* Dynamic status columns */}
                    {statusOptions.map((status, idx) => (
                      <TableHead key={idx} className="text-base font-semibold text-center text-foreground">
                        {String(status).charAt(0).toUpperCase() + String(status).slice(1)}
                      </TableHead>
                    ))}
                    <TableHead className="text-base font-semibold text-center text-foreground">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((msg: any) => {
                    const msgLogs = Array.isArray(msg.logs) ? msg.logs : [];
                    const statusCounts = statusOptions.reduce((acc: Record<string, number>, status) => {
                      acc[String(status)] = msgLogs.reduce((count: number, log: any) => count + (String(log.status) === String(status) ? 1 : 0), 0);
                      return acc;
                    }, {});
                    return (
                      <>
                        <TableRow key={msg.message_id}>
                          <TableCell className="w-[45%] truncate text-base">{msg.message_text}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{msg.sent_at ? new Date(msg.sent_at).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                          }) : ''}</TableCell>
                          {/* Dynamic status counts */}
                          {statusOptions.map((status, idx) => (
                            <TableCell key={idx} className="text-center font-semibold text-base text-foreground">
                              {statusCounts[String(status)]}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            <Button size="sm" variant="outline" onClick={() => setExpandedMsgId(expandedMsgId === msg.message_id ? null : msg.message_id)}>
                              <Eye className="w-4 h-4 mr-1" />
                              {expandedMsgId === msg.message_id ? "Hide" : "Details"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expandedMsgId === msg.message_id && (
                          <TableRow>
                            <TableCell colSpan={3 + statusOptions.length} className="p-0 border-none">
                              <div className="flex justify-center items-center py-4">
                                <div className="w-full flex justify-center">
                                  <div
                                    className="rounded-2xl bg-gray-100 text-foreground border border-primary/20 shadow-lg p-6"
                                    style={{ maxWidth: '98%', width: '98%', padding: '15px' }}
                                  >
                                    <h3 className="text-lg font-semibold mb-4 text-primary">Delivery Details</h3>
                                    <Table className="w-full">
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-base font-semibold text-foreground">Name</TableHead>
                                          <TableHead className="text-base font-semibold text-foreground">Phone Number</TableHead>
                                          <TableHead className="text-base font-semibold text-center text-foreground">Sent At</TableHead>
                                          <TableHead className="text-base font-semibold text-center text-foreground">Status</TableHead>
                                          <TableHead className="text-base font-semibold text-center text-foreground">Retry</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {msgLogs.map((log: any) => (
                                          <TableRow key={log.id} className="hover:bg-gray-200">
                                            <TableCell className="font-normal">{log.subscriber_name}</TableCell>
                                            <TableCell className="font-normal">{formatPhoneNumber ? formatPhoneNumber(log.subscriber_phone) : log.subscriber_phone}</TableCell>
                                            <TableCell className="text-center font-normal">{log.updated_at ? new Date(log.updated_at).toLocaleString(undefined, {
                                              month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                                            }) : ''}</TableCell>
                                            <TableCell className="text-center font-normal">{log.status ? log.status.replace(/(^|\s)[a-z]/g, (c: string) => c.toUpperCase()) : ""}</TableCell>
                                            <TableCell className="text-center font-normal">
                                              <Button
                                                size="sm"
                                                variant={log.status === "failed" ? "destructive" : "outline"}
                                                className={log.status === "failed" ? "bg-red-500 text-white" : "bg-gray-300 text-gray-700"}
                                                disabled={log.status !== "failed"}
                                                onClick={async () => {
                                                  try {
                                                    await fetch("/api/retry-message", {
                                                      method: "POST",
                                                      headers: { "Content-Type": "application/json" },
                                                      body: JSON.stringify({
                                                        message_id: log.message_id,
                                                        phone_number: log.subscriber_phone,
                                                      }),
                                                    });
                                                    alert("Retry sent!");
                                                  } catch (err) {
                                                    alert("Retry failed.");
                                                  }
                                                }}
                                              >
                                                <RotateCcw className="w-4 h-4 mr-1" /> Retry
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base font-semibold text-foreground">Message</TableHead>
                    <TableHead className="text-base font-semibold text-foreground">Name</TableHead>
                    <TableHead className="text-base font-semibold text-foreground">Phone Number</TableHead>
                    <TableHead className="text-base font-semibold text-foreground">Received At</TableHead>
                    <TableHead className="text-base font-semibold text-center text-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((msg: any) => {
                    const msgLogs = Array.isArray(msg.logs) ? msg.logs : [];
                    const receivedAt = msgLogs.length > 0 ? new Date(Math.max(...msgLogs.map((log: any) => new Date(log.updated_at).getTime()))).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                    }) : '';
                    const firstLog = msgLogs[0] || {};
                    return (
                      <TableRow key={msg.message_text}>
                        <TableCell className="w-[45%] truncate text-base">{msg.message_text}</TableCell>
                        <TableCell className="text-base">{firstLog.name}</TableCell>
                        <TableCell className="text-base">{formatPhoneNumber ? formatPhoneNumber(firstLog.phone_number) : firstLog.phone_number}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{receivedAt}</TableCell>
                        <TableCell className="text-center font-normal text-base text-foreground">
                          {firstLog.status ? firstLog.status.charAt(0).toUpperCase() + firstLog.status.slice(1) : ""}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
