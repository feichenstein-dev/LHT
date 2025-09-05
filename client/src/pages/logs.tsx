import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatPhoneNumber } from "@/lib/supabase";
import { Eye } from "lucide-react";
import { useToast } from "../hooks/use-toast";

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true
  });
}

export default function Logs() {
  const getInitialDirection = () => {
    const val = localStorage.getItem('logs_direction');
    if (val === 'lht' || val === 'inbound' || val === 'outbound') return val;
    return 'lht';
  };
  const [direction, setDirection] = useState<'lht' | 'inbound' | 'outbound'>(getInitialDirection);
  const [selected, setSelected] = useState<string>(() => {
    return localStorage.getItem('logs_selected') || 'all';
  });
  const [filterDate, setFilterDate] = useState<string>(() => {
    return localStorage.getItem('logs_filterDate') || "";
  });
  const [expandedMsgId, setExpandedMsgId] = useState<string|null>(null);
  const { toast } = useToast ? useToast() : { toast: () => {} };
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Persist dropdowns
  const persist = (key: string, value: string) => {
    localStorage.setItem(key, value);
  };

  // Fetch logs, messages, subscribers
  const { data: logsData, isLoading } = useQuery({
    queryKey: ["/api/delivery-logs", "all"],
    queryFn: async () => {
      const response = await fetch("/api/delivery-logs?limit=10000&page=1");
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json();
    },
  });
  const logs = logsData?.logs || [];

  const { data: messagesData } = useQuery({
    queryKey: ["/api/messages"],
    queryFn: async () => {
      const response = await fetch("/api/messages");
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    select: (msgs) => [...msgs].sort((a, b) => new Date(b.sent_at || '').getTime() - new Date(a.sent_at || '').getTime()),
  });

  const { data: subscribersData } = useQuery({
    queryKey: ["/api/subscribers"],
    queryFn: async () => {
      const response = await fetch("/api/subscribers");
      if (!response.ok) throw new Error("Failed to fetch subscribers");
      return response.json();
    },
  });

  // Dropdown options
  let dropdownOptions: { value: string, label: string, date?: string }[] = [];
  if (direction === 'lht' && messagesData) {
    dropdownOptions = messagesData
      .map((msg: any) => ({
        value: msg.id,
        label: `${msg.body.slice(0, 60)}${msg.body.length > 60 ? '...' : ''} (${formatDate(msg.sent_at)})`,
        date: msg.sent_at
      }))
      .sort((a: { date?: string }, b: { date?: string }) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
  } else if ((direction === 'inbound' || direction === 'outbound') && subscribersData && logs.length) {
    // Find latest log date for each subscriber
    const subDates: Record<string, string> = {};
    logs.forEach((log: any) => {
      if (log.subscriber_id) {
        if (!subDates[log.subscriber_id] || new Date(log.updated_at) > new Date(subDates[log.subscriber_id])) {
          subDates[log.subscriber_id] = log.updated_at;
        }
      }
    });
    dropdownOptions = subscribersData
      .map((sub: any) => ({
        value: sub.id,
        label: `${sub.name || formatPhoneNumber(sub.phone_number)}`,
        date: subDates[sub.id] || ''
      }))
      .sort((a: { date?: string }, b: { date?: string }) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
  }

  // Filter logs
  let filteredLogs = logs.filter((log: any) => {
    if (direction === 'lht') {
      if (!log.message_id) return false;
      if (selected !== 'all' && log.message_id !== selected) return false;
    } else if (direction === 'inbound') {
      if (log.direction !== 'inbound') return false;
      if (selected !== 'all' && log.subscriber_id !== selected) return false;
    } else if (direction === 'outbound') {
      if (log.direction !== 'outbound') return false;
      if (log.message_id) return false;
      if (selected !== 'all' && log.subscriber_id !== selected) return false;
    }
    if (filterDate) {
      const logDate = new Date(log.updated_at);
      const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
      if (logDateStr !== filterDate) return false;
    }
    return true;
  });

  // For LHT, group logs by message_id
  let groupedLHT: any[] = [];
  if (direction === 'lht' && messagesData) {
    groupedLHT = messagesData.map((msg: any) => {
      const msgLogs = filteredLogs.filter((log: any) => log.message_id === msg.id && log.direction === 'outbound');
      return {
        message_id: msg.id,
        message_text: msg.body,
        sent_at: msg.sent_at,
        delivered_count: msg.delivered_count || 0,
        current_active_subscribers: msg.current_active_subscribers || 0,
        logs: msgLogs,
      };
    }).filter((msg: any) => selected === 'all' || msg.message_id === selected);
  }

  // For inbound/outbound, sort filteredLogs by date desc
  if (direction === 'inbound' || direction === 'outbound') {
    filteredLogs = filteredLogs.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  // For LHT, get dynamic status columns and counts
  let statusOptions: string[] = [];
  let statusCountsByMsg: Record<string, Record<string, number>> = {};
  if (direction === 'lht' && groupedLHT.length) {
    // Collect all unique statuses from logs
    const allStatuses = new Set<string>();
    groupedLHT.forEach((msg: any) => {
      msg.logs.forEach((log: any) => {
        if (log.status) allStatuses.add(log.status);
      });
    });
    statusOptions = Array.from(allStatuses);
    // For each message, count logs by status
    groupedLHT.forEach((msg: any) => {
      statusCountsByMsg[msg.message_id] = {};
      statusOptions.forEach(status => {
        statusCountsByMsg[msg.message_id][status] = msg.logs.filter((log: any) => log.status === status).length;
      });
    });
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-gradient-to-b from-muted/30 to-muted/10 py-4 px-2">
      <Card className="w-full max-w-screen-xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Delivery Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-4 mb-6 w-full">
            <div style={{ flexBasis: '20%' }}>
              <Select
                value={direction}
                onValueChange={v => {
                  setDirection(v as any);
                  persist('logs_direction', v);
                  setSelected('all');
                  persist('logs_selected', 'all');
                }}
              >
                <SelectTrigger className="min-w-[220px] w-auto h-12 text-base bg-muted rounded-2xl px-4">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent className="min-w-[220px] w-auto">
                  <SelectItem value="lht">Sefer Chofetz Chaim Texts</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
      <div style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
              <Select value={selected} onValueChange={v => { setSelected(v); persist('logs_selected', v); }}>
        <SelectTrigger className="w-full h-12 text-base bg-muted rounded-2xl px-4">
                  <SelectValue placeholder={direction === 'lht' ? 'Filter by message' : 'Filter by subscriber'} />
                </SelectTrigger>
        <SelectContent className="w-full">
                  <SelectItem value="all" className="w-[30%]">All {direction === 'lht' ? 'Messages' : 'Subscribers'}</SelectItem>
                  {dropdownOptions.map((opt, idx) => (
                    <SelectItem key={idx} value={opt.value} className="w-full truncate" title={opt.label}>
                      <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div style={{ flexBasis: '10%' }}>
              <input
                type="date"
                className="w-full h-12 text-base bg-muted rounded-2xl px-4 border border-gray-300"
                value={filterDate}
                onChange={e => { setFilterDate(e.target.value); persist('logs_filterDate', e.target.value); }}
              />
            </div>
          </div>
          <div className="bg-background rounded-xl shadow-md w-full" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">Loading logs...</div>
            ) : direction === 'lht' ? (
              <Table className="table-auto w-full" style={{ tableLayout: 'fixed' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base font-semibold text-foreground">Message</TableHead>
                    <TableHead className="text-base font-semibold text-foreground">Sent At</TableHead>
                    {statusOptions.map((status, idx) => (
                      <TableHead key={idx} className="text-base font-semibold text-center text-foreground">{status.charAt(0).toUpperCase() + status.slice(1)}</TableHead>
                    ))}
                    <TableHead className="text-base font-semibold text-center text-foreground">Subscribers</TableHead>
                    <TableHead className="text-base font-semibold text-center text-foreground">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedLHT.map((msg: any) => (
                    <>
                      <TableRow key={msg.message_id}>
                        <TableCell className="truncate text-base" style={{ maxWidth: 500 }} title={msg.message_text || ''}>{msg.message_text.length > 100 ? `${msg.message_text.slice(0, 100)}...` : msg.message_text}</TableCell>
                        <TableCell className="text-sm" style={{ color: 'black' }}>{formatDate(msg.sent_at)}</TableCell>
                        {statusOptions.map((status, idx) => (
                          <TableCell key={idx} className="text-center font-semibold text-base text-foreground">{statusCountsByMsg[msg.message_id]?.[status] || 0}</TableCell>
                        ))}
                        <TableCell className="text-center font-semibold text-base text-foreground">{msg.current_active_subscribers}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline" onClick={() => setExpandedMsgId(expandedMsgId === msg.message_id ? null : msg.message_id)}>
                            <Eye className="w-4 h-4 mr-1" />
                            {expandedMsgId === msg.message_id ? "Hide" : "Details"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedMsgId === msg.message_id && (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0 border-none">
                            <div className="flex justify-center items-center py-4">
                              <div className="w-full flex justify-center">
                                <div className="rounded-2xl bg-gray-100 text-black border border-primary/20 shadow-lg p-6" style={{ maxWidth: '98%', width: '98%', padding: '15px' }}>
                                  <h3 className="text-lg font-semibold mb-4" style={{ color: 'black' }}>Delivery Details</h3>
                                  <p className="text-sm mb-4"><strong>Full Message:</strong> {msg.message_text}</p>
                                  <p className="text-sm mb-4">
                                      <strong>Character Count:</strong> {msg.message_text ? `${msg.message_text.length}/${/[\u0590-\u05FF]/.test(msg.message_text) ? 670 : 1530} characters` : `0/1530 characters`}
                                  </p>
                                  <p className="text-sm mb-4"><strong>Sent To:</strong> {`${msg.delivered_count || 0} delivered / ${msg.current_active_subscribers || 0} active subscribers`}</p>
                                  <Table className="w-full">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-base font-semibold text-left text-foreground" style={{ width: '30%' }}>Name</TableHead>
                                        <TableHead className="text-base font-semibold text-left text-foreground">Phone Number</TableHead>
                                        <TableHead className="text-base font-semibold text-left text-foreground">Sent At</TableHead>
                                        <TableHead className="text-base font-semibold text-left text-foreground">Status</TableHead>

                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {msg.logs.map((log: any) => {
                                        const sub = subscribersData?.find((s: any) => s.id === log.subscriber_id);
                                        return (
                                          <TableRow key={log.id} className="hover:bg-gray-200">
                                            <TableCell className="font-normal" style={{ width: '30%' }}>{sub?.name || log.name || "N/A"}</TableCell>
                                            <TableCell className="font-normal">{formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number}</TableCell>
                                            <TableCell className="text-left font-normal">{formatDate(log.updated_at)}</TableCell>
                                            <TableCell className="text-left font-normal">{log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : ""}</TableCell>
                                            {/* Action column removed */}
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '30%' }}>Message</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '15%' }}>Name</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '10%' }}>Phone Number</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '15%' }}>{direction === 'inbound' ? 'Received At' : 'Sent At'}</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '10%' }}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log: any) => {
                    const sub = subscribersData?.find((s: any) => s.id === log.subscriber_id);
                    const msgText = (log.message_text || '').length > 100 ? `${log.message_text.slice(0, 100)}...` : (log.message_text || '');
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="truncate text-base" style={{ maxWidth: 300 }} title={log.message_text || ''}>{msgText}</TableCell>
                        <TableCell className="font-normal">{sub?.name || log.name || ""}</TableCell>
                        <TableCell className="font-normal">{formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number || ""}</TableCell>
                        <TableCell className="text-left font-normal">{formatDate(log.updated_at)}</TableCell>
                        <TableCell className="text-left font-normal flex items-center gap-2">
                          <span>{log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : ""}</span>
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
