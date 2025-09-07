import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useQuery } from "@tanstack/react-query";
import ReactDOM from "react-dom";
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
  // Inject custom styles for the datepicker clear button and disable pull-to-refresh/overscroll
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      html, body {
        overscroll-behavior-y: contain !important;
        overscroll-behavior-x: none !important;
        touch-action: pan-x !important;
      }
      .logs-disable-overscroll {
        overscroll-behavior: contain !important;
        touch-action: pan-x !important;
        -webkit-overflow-scrolling: auto !important;
      }
      .react-datepicker__close-icon {
        right: 1.5rem !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        width: 2rem !important;
        height: 2rem !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: none !important;
        padding: 0 !important;
      }
      .react-datepicker__close-icon::after {
        color: #64748b !important; /* Tailwind slate-500 */
        font-size: 1.25rem !important;
        font-weight: 600 !important;
        background: none !important;
        border-radius: 50%;
        box-shadow: none !important;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        line-height: 1.75rem;
        text-align: center;
        margin: 0 auto;
        transition: background 0.15s, color 0.15s;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
  const getInitialDirection = () => {
    const val = localStorage.getItem('logs_direction');
    if (val === 'lht' || val === 'inbound' || val === 'outbound') return val;
    return 'lht';
  };
  const [direction, setDirection] = useState<'lht' | 'inbound' | 'outbound'>(getInitialDirection);
  const [selected, setSelected] = useState<string>(() => {
    return localStorage.getItem('logs_selected') || 'all';
  });
  const [filterDate, setFilterDate] = useState<Date | null>(() => {
    const val = localStorage.getItem('logs_filterDate');
    return val ? new Date(val) : null;
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
      if (filterDate && messagesData) {
        // Find the message for this log
        const msg = messagesData.find((m: any) => m.id === log.message_id);
        if (!msg) return false;
        const msgDate = new Date(msg.sent_at);
        if (
          msgDate.getFullYear() !== filterDate.getFullYear() ||
          msgDate.getMonth() !== filterDate.getMonth() ||
          msgDate.getDate() !== filterDate.getDate()
        ) return false;
      }
    } else if (direction === 'inbound') {
      if (log.direction !== 'inbound') return false;
      if (selected !== 'all' && log.subscriber_id !== selected) return false;
      if (filterDate) {
        const logDate = new Date(log.updated_at);
        if (
          logDate.getFullYear() !== filterDate.getFullYear() ||
          logDate.getMonth() !== filterDate.getMonth() ||
          logDate.getDate() !== filterDate.getDate()
        ) return false;
      }
    } else if (direction === 'outbound') {
      if (log.direction !== 'outbound') return false;
      if (log.message_id) return false;
      if (selected !== 'all' && log.subscriber_id !== selected) return false;
      if (filterDate) {
        const logDate = new Date(log.updated_at);
        if (
          logDate.getFullYear() !== filterDate.getFullYear() ||
          logDate.getMonth() !== filterDate.getMonth() ||
          logDate.getDate() !== filterDate.getDate()
        ) return false;
      }
    }
    return true;
  });

  // For LHT, group logs by message_id and filter messages by date (not logs)
  let groupedLHT: any[] = [];
  let statusOptions: string[] = [];
  let statusCountsByMsg: Record<string, Record<string, number>> = {};
  if (direction === 'lht' && messagesData) {
    // Filter messages by date if needed
    let filteredMessages = messagesData;
    if (filterDate) {
      filteredMessages = messagesData.filter((msg: any) => {
        const msgDate = new Date(msg.sent_at);
        return (
          msgDate.getFullYear() === filterDate.getFullYear() &&
          msgDate.getMonth() === filterDate.getMonth() &&
          msgDate.getDate() === filterDate.getDate()
        );
      });
    }
    if (selected !== 'all') {
      filteredMessages = filteredMessages.filter((msg: any) => msg.id === selected);
    }
    groupedLHT = filteredMessages.map((msg: any) => {
      const msgLogs = logs.filter((log: any) => log.message_id === msg.id && log.direction === 'outbound');
      return {
        message_id: msg.id,
        message_text: msg.body,
        sent_at: msg.sent_at,
        delivered_count: msg.delivered_count || 0,
        current_active_subscribers: msg.current_active_subscribers || 0,
        logs: msgLogs,
      };
    });
    // Collect all unique statuses from all logs for these messages
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

  // For inbound/outbound, sort filteredLogs by date desc
  if (direction === 'inbound' || direction === 'outbound') {
    filteredLogs = filteredLogs.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  const retryMessage = async (messageId: string) => {
    setRetryingId(messageId);
    try {
      const response = await fetch(`/api/retry-message/${messageId}`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to retry message');
      toast({ title: 'Retry Successful', description: 'The message has been retried successfully.' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Retry Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setRetryingId(null);
    }
  };

  if (direction === 'inbound') {
    filteredLogs = filteredLogs.map((log: any) => {
      const { action, ...rest } = log;
      return rest;
    });
  }

  return (
  <div className="flex flex-col w-full min-h-screen bg-gradient-to-b from-muted/30 to-muted/10 py-4 px-2 logs-disable-overscroll">
      <Card className="w-full max-w-screen-xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Delivery Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-4 mb-6 w-full flex-wrap">
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
                <SelectTrigger className="min-w-[300px] w-auto h-12 text-base bg-muted rounded-2xl px-4">
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
        <SelectTrigger className="w-full h-12 text-base bg-muted rounded-2xl px-4 min-w-[300px]">
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
            <div style={{ flexBasis: '25%', paddingRight: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <DatePicker
                  selected={filterDate}
                  onChange={date => {
                    setFilterDate(date);
                    persist('logs_filterDate', date ? date.toISOString().slice(0, 10) : "");
                  }}
                  isClearable
                  placeholderText="All Dates"
                  className="w-full h-12 text-base bg-muted rounded-2xl px-4 border border-gray-300"
                  calendarClassName="rounded-2xl shadow-lg border border-gray-200"
                  wrapperClassName="w-full"
                  dateFormat="yyyy-MM-dd"
                  popperPlacement="bottom"
                  showPopperArrow={false}
                  popperContainer={({ children }) => ReactDOM.createPortal(children, document.body)}
                />
              </div>
            </div>
          </div>
          <div className="bg-background rounded-xl shadow-md w-full" style={{ maxHeight: '70vh', minHeight: '300px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">Loading logs...</div>
            ) : direction === 'lht' ? (
              <Table className="w-full" style={{ tableLayout: 'auto' }}>
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
                      <TableRow key={msg.message_id} style={{ width: '100%', background: expandedMsgId === msg.message_id ? 'rgba(0,0,0,0.01)' : undefined }}>
                        <TableCell className="truncate text-base" style={{ maxWidth: 300 }} title={msg.message_text || ''}>{msg.message_text.length > 100 ? `${msg.message_text.slice(0, 100)}...` : msg.message_text}</TableCell>
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
                        <TableRow style={{ width: '100%' }}>
                          <TableCell colSpan={5 + statusOptions.length} className="p-0 border-none">
                            <div className="flex justify-center items-center py-4" style={{ width: '100%' }}>
                              <div className="w-full flex justify-center" style={{ width: '100%' }}>
                                <div className="rounded-2xl bg-gray-100 text-black border border-primary/20 shadow-lg p-6" style={{ maxWidth: '98%', width: '100%' }}>
                                  <h3 className="text-lg font-semibold mb-4" style={{ color: 'black' }}>Delivery Details</h3>
                                  <p className="text-sm mb-4"><strong>Full Message:</strong> {msg.message_text}</p>
                                  <p className="text-sm mb-4">
                                      <strong>Character Count:</strong> {msg.message_text ? `${msg.message_text.length}/${/[F]/.test(msg.message_text) ? 670 : 1530} characters` : `0/1530 characters`}
                                  </p>
                                  <p className="text-sm mb-4"><strong>Sent To:</strong> {`${msg.delivered_count || 0} delivered / ${msg.current_active_subscribers || 0} active subscribers`}</p>
                                  <Table className="w-full">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-base font-semibold text-left text-foreground" style={{ width: '30%' }}>Name</TableHead>
                                        <TableHead className="text-base font-semibold text-left text-foreground">Phone Number</TableHead>
                                        <TableHead className="text-base font-semibold text-left text-foreground">Sent At</TableHead>
                                        <TableHead className="text-base font-semibold text-left text-foreground">Status</TableHead>
                                        <TableHead className="text-base font-semibold text-left text-foreground">Action</TableHead>
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
                                            <TableCell className="text-left font-normal">
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => retryMessage(log.id)}
                                              >
                                                {retryingId === log.id ? 'Retrying...' : 'Retry'}
                                              </Button>
                                            </TableCell>
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
              <Table className="w-full" style={{ tableLayout: 'auto' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '25%' }}>Message</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '15%' }}>Name</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '15%' }}>Phone Number</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '20%' }}>{direction === 'inbound' ? 'Received At' : 'Sent At'}</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '15%' }}>Status</TableHead>
                    {direction !== 'inbound' && (
                      <TableHead className="text-base font-semibold text-foreground" style={{ width: '10%' }}>Action</TableHead>
                    )}
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
                        <TableCell className="text-left font-normal">
                          <span>{log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : ""}</span>
                        </TableCell>
                        {direction !== 'inbound' && (
                          <TableCell className="text-left font-normal">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryMessage(log.id)}
                            >
                              {retryingId === log.id ? 'Retrying...' : 'Retry'}
                            </Button>
                          </TableCell>
                        )}
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
