import { useState, useEffect } from "react";
// Simple modal for tap-to-expand (must be inside Logs for state)
function ExpandModal({ open, onClose, value, label }: { open: boolean, onClose: () => void, value: string, label?: string }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', zIndex: 10000, top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 24, minWidth: 280, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 2px 16px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 12 }}>{label || 'Full Value'}</div>
        <div style={{ fontSize: 15, wordBreak: 'break-all', whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#222' }}>{value}</div>
        <button style={{ marginTop: 18, padding: '6px 18px', borderRadius: 8, background: '#eee', fontWeight: 500 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from '../lib/supabase';
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
import { handleApiRefresh } from "@/lib/queryClient";
import { useToast } from "../hooks/use-toast";

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true
  });
}

function DetailsModal({ isOpen, onClose, details, subscribersData, statusOptions, retryingId, retryMessage, formatPhoneNumber, formatDate, getCarrier, handleExpand, statusCountsByMsg }: { isOpen: boolean; onClose: () => void; details: any; subscribersData: any; statusOptions: string[]; retryingId: string | null; retryMessage: (log: any) => void; formatPhoneNumber: any; formatDate: any; getCarrier: any; handleExpand: any; statusCountsByMsg?: Record<string, Record<string, number>>; }) {
  // Sorting is disabled
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  if (!isOpen || !details) return null;

  // Removed unused getValue function

  // Sorting is disabled

  // Filter logs by search (name or number) and status
  const filteredLogs = [...(details.logs || [])].filter((log: any) => {
    // Status filter
    if (statusFilter === 'not_delivered') {
      if (!log.status || log.status.toLowerCase() === 'delivered') return false;
    } else if (statusFilter === 'retry_available') {
      if (log.has_delivered) return false;
    } else if (statusFilter !== 'all') {
      if (!log.status || log.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    }
    // Search filter
    if (!search.trim()) return true;
    const sub = subscribersData?.find((s: any) => s.id === log.subscriber_id);
    const name = (sub?.name || log.name || '').toLowerCase();
    const phone = (sub?.phone_number || log.phone_number || '').toLowerCase();
    const searchVal = search.toLowerCase();
    return name.includes(searchVal) || phone.includes(searchVal);
  });
  // Order by name (case-insensitive), then sent at (updated_at) ascending
  const sortedLogs = [...filteredLogs].sort((a: any, b: any) => {
    const subA = subscribersData?.find((s: any) => s.id === a.subscriber_id);
    const subB = subscribersData?.find((s: any) => s.id === b.subscriber_id);
    const nameA = (subA?.name || a.name || '').toLowerCase();
    const nameB = (subB?.name || b.name || '').toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    // If names are equal, sort by sent time ascending
    const timeA = new Date(a.updated_at).getTime();
    const timeB = new Date(b.updated_at).getTime();
    return timeA - timeB;
  });

  // Disable Retry if any log has has_delivered true
  const anyDelivered = sortedLogs.some((log: any) => log.has_delivered);


  let deliveredCount = 0;
  if (
    details &&
    details.message_id &&
    statusCountsByMsg &&
    typeof statusCountsByMsg === 'object' &&
    statusCountsByMsg[details.message_id] &&
    typeof statusCountsByMsg[details.message_id]['Delivered'] === 'number'
  ) {
    deliveredCount = statusCountsByMsg[details.message_id]['Delivered'];
  } else if (Array.isArray(details.status_counts)) {
    const deliveredRow = details.status_counts.find(
      (row: any) => row.status && row.status.toLowerCase() === 'delivered'
    );
    if (deliveredRow) {
      deliveredCount = deliveredRow.count;
    }
  } else if (typeof details.delivered_count === 'number') {
    deliveredCount = details.delivered_count;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
  <div
    className="bg-white rounded-2xl shadow-lg p-6 relative"
    style={{ width: '1200px', maxWidth: '99vw', minWidth: '800px', height: '80vh', minHeight: '600px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    onClick={e => e.stopPropagation()}
  >
        <button className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold" onClick={onClose} aria-label="Close">&times;</button>
        <h3 className="text-lg font-semibold mb-4">Delivery Details</h3>
        <div className="text-sm mb-4">
          <strong>Full Message: </strong>
          {details.message_text.includes('\n') && <><br /><br /></>}
          <span style={{ whiteSpace: 'pre-wrap' }}>{details.message_text}</span>
        </div>
        <p className="text-sm mb-4">
          <strong>Character Count:</strong> {details.message_text ? `${details.message_text.length}/${/[\u000fF]/.test(details.message_text) ? 670 : 1530} characters` : `0/1530 characters`}
        </p>
        <p className="text-sm mb-5">
          <strong>Sent To:</strong> {`${deliveredCount || 0} delivered / ${details.current_active_subscribers || 0} active subscribers`}
        </p>
  <div className="mb-4 w-full flex flex-row gap- items-center" style={{ width: '100%', fontSize: '0.9rem' }}>
          <div style={{ position: 'relative', flexGrow: 2, minWidth: 0, marginRight: 12, display: 'flex' }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or number..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200"
              style={{ minWidth: 0, fontSize: '0.9rem', paddingRight: search ? '2.2rem' : undefined }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  fontSize: '1.2rem',
                  lineHeight: 1
                }}
              >
                &#10005;
              </button>
            )}
          </div>
          <div style={{ position: 'relative', minWidth: 0, width: 260 }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 flex-shrink-0 pr-8"
              style={{
                minWidth: 240,
                maxWidth: 360,
                width: '100%',
                fontSize: '0.9rem',
                height: '44px',
                lineHeight: '1.2',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                background: `url('data:image/svg+xml;utf8,<svg fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M6 8L10 12L14 8\'/></svg>') no-repeat right 1rem center/1.1em 1.1em`,
                paddingRight: '2.5rem'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="retry_available">Retry Available</option>
              {statusOptions.map((status, idx) => (
                <option key={idx} value={status.toLowerCase()}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
              ))}
            </select>
            {/* Down arrow is now part of the select background */}
          </div>
        </div>
  <div style={{ flex: 1, minHeight: 0, maxHeight: '100%', overflowY: 'auto', overflowX: 'auto' }}>
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="text-base font-semibold text-left text-foreground" style={{ minWidth: 120, maxWidth: 260, width: 'auto' }}>Name</TableHead>
                <TableHead className="text-base font-semibold text-left text-foreground" style={{ minWidth: 140, maxWidth: 240, width: 'auto' }}>Phone Number</TableHead>
                <TableHead className="text-base font-semibold text-left text-foreground" style={{ minWidth: 80, maxWidth: 120, width: 'auto' }}>Carrier</TableHead>
                <TableHead className="text-base font-semibold text-left text-foreground" style={{ minWidth: 160, maxWidth: 320, width: 'auto' }}>Sent At</TableHead>
                <TableHead className="text-base font-semibold text-left text-foreground" style={{ minWidth: 100, maxWidth: 180, width: 'auto' }}>Status</TableHead>
                <TableHead className="text-base font-semibold text-left text-foreground" style={{ minWidth: 160, maxWidth: 320, width: 'auto' }}>Error Message</TableHead>
                <TableHead className="text-base font-semibold text-left text-foreground" style={{ minWidth: 100, maxWidth: 180, width: 'auto' }}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLogs.map((log: any) => {
                const sub = subscribersData?.find((s: any) => s.id === log.subscriber_id);
                return (
                  <TableRow key={log.id} className="hover:bg-gray-200">
                    <TableCell
                      className="font-normal log-cell-ellipsis"
                      style={{ width: 'auto', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                      onClick={() => handleExpand(sub?.name || log.name || 'N/A', 'Name')}
                      title={sub?.name || log.name || 'N/A'}
                    >
                      {sub?.name || log.name || 'N/A'}
                    </TableCell>
                    <TableCell
                      className="font-normal log-cell-ellipsis"
                      style={{ width: 'auto', maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                      onClick={() => handleExpand(formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number, 'Phone Number')}
                      title={formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number}
                    >
                      {formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number}
                    </TableCell>
                    <TableCell
                      className="font-normal log-cell-ellipsis"
                      style={{ width: 'auto', maxWidth: 120, minWidth: 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                      onClick={() => handleExpand(getCarrier(log, sub), 'Carrier')}
                      title={getCarrier(log, sub)}
                    >
                      {getCarrier(log, sub)}
                    </TableCell>
                    <TableCell
                      className="text-left font-normal log-cell-ellipsis"
                      style={{ width: 'auto', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                      onClick={() => handleExpand(formatDate(log.updated_at), 'Sent At')}
                      title={formatDate(log.updated_at)}
                    >
                      {formatDate(log.updated_at)}
                    </TableCell>
                    <TableCell
                      className="text-left font-normal log-cell-ellipsis"
                      style={{ width: 'auto', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                      onClick={() => handleExpand(log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : '', 'Status')}
                      title={log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : ''}
                    >
                      {log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : ''}
                    </TableCell>
                    <TableCell
                      className="text-left font-normal log-cell-ellipsis"
                      style={{ width: 'auto', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: log.error_message ? 'pointer' : undefined }}
                      onClick={() => log.error_message && handleExpand(log.error_message, 'Error Message')}
                      title={log.error_message || ''}
                    >
                      {log.error_message ? (log.error_message.length > 24 ? `${log.error_message.slice(0, 24)}...` : log.error_message) : ''}
                    </TableCell>
                    <TableCell className="text-left font-normal">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryMessage(log)}
                        disabled={!!log.has_delivered || retryingId === log.id}
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
  );
}

export default function Logs() {
  // Tap-to-expand state (must be inside component)
  console.log('RENDERING LOGS PAGE');
  const [expandValue, setExpandValue] = useState<string | null>(null);
  const [expandLabel, setExpandLabel] = useState<string | undefined>(undefined);
  const handleExpand = (value: string, label?: string) => {
    setExpandValue(value);
    setExpandLabel(label);
  };
  const handleCloseExpand = () => setExpandValue(null);
  const queryClient = useQueryClient();
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

  // Auto-refresh on tab focus/visibility and custom events
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("lht-autorefresh", refresh);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("lht-autorefresh", refresh);
    };
  }, [queryClient]);
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
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsModalMsg, setDetailsModalMsg] = useState<any>(null);

  const openDetailsModal = (msg: any) => {
    setDetailsModalMsg(msg);
    setDetailsModalOpen(true);
  };
  const closeDetailsModal = () => {
    setDetailsModalOpen(false);
    setDetailsModalMsg(null);
  };

  // Persist dropdowns
  const persist = (key: string, value: string) => {
    localStorage.setItem(key, value);
  };

  // Fetch logs using Supabase RPC get_filtered_logs
  const { data: logs, isLoading } = useQuery({
    queryKey: ["get_filtered_logs", direction, selected, filterDate?.toISOString().slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_filtered_logs', {
        p_direction: direction,
        p_selected: selected,
        p_filter_date: filterDate ? filterDate.toISOString().slice(0, 10) : null
      });
      if (error) throw error;
      return data || [];
    },
  });

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

  // Dropdown options using Supabase RPC get_dropdown_options
  const { data: dropdownOptions = [] } = useQuery({
    queryKey: ["get_dropdown_options", direction],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dropdown_options', {
        p_direction: direction
      });
      if (error) throw error;
      return data || [];
    },
  });

  // Filter logs (ensure logs is always an array)
  let filteredLogs = Array.isArray(logs) ? logs.filter((log: any) => {
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
  }) : [];

  // For LHT, group logs by message_id and filter messages by date (not logs)
  let groupedLHT: any[] = [];
  let statusOptions: string[] = [];
  let statusCountsByMsg: Record<string, Record<string, number>> = {};

  // Fetch status counts from Supabase procedure (get_status_counts)
  const { data: statusCountsData, isLoading: isStatusCountsLoading } = useQuery({
    queryKey: ["get_status_counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_status_counts');
      if (error) throw error;
      return data;
    },
  });

  // Helper to get carrier: prefer log.carrier, fallback to subscriber.carrier
  const getCarrier = (log: any, sub: any) => {
    if (log && log.carrier) return log.carrier;
    if (sub && sub.carrier) return sub.carrier;
    return '';
  };
  // Fetch grouped LHT logs using Supabase RPC get_grouped_lht_logs
  const { data: groupedLHTData } = useQuery({
    queryKey: ["get_grouped_lht_logs", selected, filterDate?.toISOString().slice(0, 10)],
    queryFn: async () => {
      if (direction !== 'lht') return [];
      const { data, error } = await supabase.rpc('get_grouped_lht_logs', {
        p_selected: selected,
        p_filter_date: filterDate ? filterDate.toISOString().slice(0, 10) : null
      });
      if (error) throw error;
      return data || [];
    },
    enabled: direction === 'lht',
  });
  if (direction === 'lht') {
    groupedLHT = groupedLHTData || [];
    // Use status counts from Supabase procedure
    if (statusCountsData && Array.isArray(statusCountsData)) {
      // statusCountsData: [{ message_id, status, count }, ...]
      // Build statusOptions and statusCountsByMsg
      const allStatuses = new Set<string>();
      statusCountsData.forEach((row: any) => {
        if (row.status) allStatuses.add(row.status.charAt(0).toUpperCase() + row.status.slice(1));
      });
      statusOptions = Array.from(allStatuses);
      statusCountsByMsg = {};
      statusCountsData.forEach((row: any) => {
        if (!statusCountsByMsg[row.message_id]) statusCountsByMsg[row.message_id] = {};
        statusCountsByMsg[row.message_id][row.status.charAt(0).toUpperCase() + row.status.slice(1)] = row.count;
      });
    }
  }

  // For inbound/outbound, sort filteredLogs by date desc
  if (direction === 'inbound' || direction === 'outbound') {
    filteredLogs = filteredLogs.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  // Retry a message by calling /api/messages with one number and log info
  const retryMessage = async (log: any) => {
    setRetryingId(log.id);
    try {
      // Compose the payload for /api/messages
      const payload: any = {
        body: log.message_text,
        numbers: [log.phone_number],
        message_id: log.message_id ?? undefined,
        // Optionally include more info if needed by backend
        name: log.name ?? undefined,
        direction: log.direction ?? undefined,
        telnyx_message_id: log.telnyx_message_id ?? undefined,
        subscriber_id: log.subscriber_id ?? undefined,
        from: log.from ?? undefined,
        messaging_profile_id: log.messaging_profile_id ?? undefined,
        webhook_url: log.webhook_url ?? undefined,
      };
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      handleApiRefresh(data);
      if (!response.ok) throw new Error('Failed to retry message');
      toast({ title: 'Retry Successful', description: 'The message has been retried successfully.' });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
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
      <Card className="w-full max-w-[100vw] mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Delivery Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-4 mb-6 w-full flex-wrap">
            <div style={{ flexBasis: '28%' }}>
              <Select
                value={direction}
                onValueChange={v => {
                  setDirection(v as any);
                  persist('logs_direction', v);
                  setSelected('all');
                  persist('logs_selected', 'all');
                }}
              >
                <SelectTrigger className="w-full h-12 text-base bg-muted rounded-2xl px-4">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent className="min-w-[220px] w-auto">
                  <SelectItem value="lht">Sefer Chofetz Chaim Texts</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ flexGrow: 1, flexBasis: 0, minWidth: 0, maxWidth: '42%' }}>
              <Select value={selected} onValueChange={v => { setSelected(v); persist('logs_selected', v); }}>
                <SelectTrigger className="w-full h-12 text-base bg-muted rounded-2xl px-4">
                  <SelectValue placeholder={direction === 'lht' ? 'Filter by message' : 'Filter by subscriber'} />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="all" className="w-full">All {direction === 'lht' ? 'Messages' : 'Subscribers'}</SelectItem>
                  {dropdownOptions.map((opt: { value: string, label: string, date?: string }, idx: number) => (
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
                  calendarClassName="rounded-2xl shadow-lg border border-gray-200"
                  wrapperClassName="w-full"
                  dateFormat="yyyy-MM-dd"
                  popperPlacement="bottom"
                  showPopperArrow={false}
                  popperContainer={({ children }) => ReactDOM.createPortal(children, document.body)}
                  customInput={
                    <button
                      type="button"
                      className="w-full h-12 text-base bg-muted rounded-2xl px-4 border border-gray-300 text-left"
                      style={{ cursor: 'pointer' }}
                    >
                      {filterDate ? filterDate.toLocaleDateString() : 'All Dates'}
                    </button>
                  }
                />
              </div>
            </div>
          </div>
          <div className="bg-background rounded-xl shadow-md w-full" style={{ maxWidth: '100vw', width: '100%', maxHeight: '70vh', minHeight: '300px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', overflowX: 'hidden' }}>
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">Loading logs...</div>
            ) : direction === 'lht' ? (
              <Table className="w-full" style={{ tableLayout: 'fixed', maxWidth: '100%' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '20%' }}>Message</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '10%' }}>Sent At</TableHead>
                    {statusOptions.map((status, idx) => (
                      <TableHead key={idx} className="text-base font-semibold text-center text-foreground" style={{ width: '7%' }}>{status.charAt(0).toUpperCase() + status.slice(1)}</TableHead>
                    ))}
                    <TableHead className="text-base font-semibold text-center text-foreground" style={{ width: '10%' }}>Subscribers</TableHead>
                    <TableHead className="text-base font-semibold text-center text-foreground" style={{ width: '10%' }}>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedLHT.map((msg: any) => (
                    <TableRow key={msg.message_id} style={{ width: '100%', background: undefined }}>
                      <TableCell
                        className="truncate text-base log-cell-ellipsis"
                        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                        title={msg.message_text || ''}
                        onClick={() => handleExpand(msg.message_text || '', 'Message')}
                      >
                        {msg.message_text.length > 100 ? `${msg.message_text.slice(0, 100)}...` : msg.message_text}
                      </TableCell>
                      <TableCell
                        className="text-sm log-cell-ellipsis"
                        style={{ color: 'black', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                        title={formatDate(msg.sent_at)}
                        onClick={() => handleExpand(formatDate(msg.sent_at), 'Sent At')}
                      >
                        {formatDate(msg.sent_at)}
                      </TableCell>
                      {statusOptions.map((status, idx) => (
                        <TableCell
                          key={idx}
                          className="text-center font-semibold text-base text-foreground log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title={String(statusCountsByMsg[msg.message_id]?.[status] || 0)}
                        >
                          {statusCountsByMsg[msg.message_id]?.[status] || 0}
                        </TableCell>
                      ))}
                      <TableCell
                        className="text-center font-semibold text-base text-foreground log-cell-ellipsis"
                        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={String(msg.current_active_subscribers)}
                      >
                        {msg.current_active_subscribers}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="outline" onClick={() => openDetailsModal(msg)}>
                          <Eye className="w-4 h-4 mr-1" /> Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table className="w-full" style={{ tableLayout: 'fixed', whiteSpace: 'nowrap' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '14%' }}>Message</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '13%' }}>Name</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '13%' }}>Phone Number</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '13%' }}>Carrier</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '13%' }}>{direction === 'inbound' ? 'Received At' : 'Sent At'}</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '10%' }}>Status</TableHead>
                    <TableHead className="text-base font-semibold text-foreground" style={{ width: '14%' }}>Error Message</TableHead>
                    {direction !== 'inbound' && (
                      <TableHead className="text-base font-semibold text-foreground" style={{ width: '10%' }}>Action</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log: any) => {
                    console.log('RENDERED TABLE ROW', log);
                    const sub = subscribersData?.find((s: any) => s.id === log.subscriber_id);
                    const msgText = (log.message_text || '').length > 100 ? `${log.message_text.slice(0, 100)}...` : (log.message_text || '');
                    // Debug log for has_delivered
                    console.log('has_delivered:', log.has_delivered, typeof log.has_delivered, log);
                    return (
                      <TableRow key={log.id}>
                        <TableCell
                          className="truncate text-base log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                          title={log.message_text || ''}
                          onClick={() => handleExpand(log.message_text || '', 'Message')}
                        >
                          {msgText}
                        </TableCell>
                        <TableCell
                          className="font-normal log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                          title={sub?.name || log.name || ''}
                          onClick={() => handleExpand(sub?.name || log.name || '', 'Name')}
                        >
                          {sub?.name || log.name || ""}
                        </TableCell>
                        <TableCell
                          className="font-normal log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                          title={formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number || ''}
                          onClick={() => handleExpand(formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number || '', 'Phone Number')}
                        >
                          {formatPhoneNumber ? formatPhoneNumber(sub?.phone_number || log.phone_number) : sub?.phone_number || log.phone_number || ""}
                        </TableCell>
                        <TableCell
                          className="font-normal log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                          title={getCarrier(log, sub)}
                          onClick={() => handleExpand(getCarrier(log, sub), 'Carrier')}
                        >
                          {getCarrier(log, sub)}
                        </TableCell>
                        <TableCell
                          className="text-left font-normal log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                          title={formatDate(log.updated_at)}
                          onClick={() => handleExpand(formatDate(log.updated_at), direction === 'inbound' ? 'Received At' : 'Sent At')}
                        >
                          {formatDate(log.updated_at)}
                        </TableCell>
                        <TableCell
                          className="text-left font-normal log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                          title={log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : ''}
                          onClick={() => handleExpand(log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : '', 'Status')}
                        >
                          <span>{log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : ""}</span>
                        </TableCell>
                        <TableCell
                          className="text-left font-normal log-cell-ellipsis"
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: log.error_message ? 'pointer' : undefined }}
                          title={log.error_message || ''}
                          onClick={() => log.error_message && handleExpand(log.error_message, 'Error Message')}
                        >
                          {log.error_message ? (
                            log.error_message.length > 24 ? `${log.error_message.slice(0, 24)}...` : log.error_message
                          ) : ''}
                        </TableCell>
                        {direction !== 'inbound' && (
                          <TableCell className="text-left font-normal">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryMessage(log)}
                              disabled={!!log.has_delivered || retryingId === log.id}
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
      <ExpandModal open={!!expandValue} onClose={handleCloseExpand} value={expandValue || ''} label={expandLabel} />
      <DetailsModal
        isOpen={detailsModalOpen}
        onClose={closeDetailsModal}
        details={detailsModalMsg}
        subscribersData={subscribersData}
        statusOptions={statusOptions}
        retryingId={retryingId}
        retryMessage={retryMessage}
        formatPhoneNumber={formatPhoneNumber}
        formatDate={formatDate}
        getCarrier={getCarrier}
        handleExpand={handleExpand}
        statusCountsByMsg={statusCountsByMsg}
      />
    </div>
  );
}
