import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LogDetailModal } from "@/components/log-detail-modal";
import { formatPhoneNumber, formatTimestamp } from "@/lib/supabase";
import { Search, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import type { DeliveryLog, Subscriber } from "@shared/schema";

export default function Logs() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<(DeliveryLog & { subscriber: Subscriber | null }) | null>(null);
  const [logDetailOpen, setLogDetailOpen] = useState(false);

  const limit = 10;

  const { data: logsData, isLoading } = useQuery({
    queryKey: ["/api/delivery-logs", { search, status: statusFilter, dateRange: dateFilter, page, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (dateFilter) params.append('dateRange', dateFilter);
      
      const response = await fetch(`/api/delivery-logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
  });

  const { data: stats } = useQuery<{totalSent: number; delivered: number; failed: number; pending: number;}>({ 
    queryKey: ["/api/delivery-stats"],
  });

  const logs = logsData?.logs || [];
  const pagination = logsData?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleViewLog = (log: DeliveryLog & { subscriber: Subscriber | null }) => {
    setSelectedLog(log);
    setLogDetailOpen(true);
  };

  const handlePreviousPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < pagination.totalPages) setPage(page + 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters and Search */}
      <div className="bg-background border-b border-border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by message or phone number..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1); // Reset to first page on search
              }}
              className="pl-10"
              data-testid="search-input"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}>
              <SelectTrigger className="w-32" data-testid="status-filter">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={(value) => {
              setDateFilter(value);
              setPage(1);
            }}>
              <SelectTrigger className="w-32" data-testid="date-filter">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground" data-testid="stat-total">
                {stats?.totalSent || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Sent</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="stat-delivered">
                {stats?.delivered || 0}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">Delivered</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="stat-failed">
                {stats?.failed || 0}
              </div>
              <div className="text-sm text-red-600 dark:text-red-400">Failed</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400" data-testid="stat-pending">
                {stats?.pending || 0}
              </div>
              <div className="text-sm text-yellow-600 dark:text-yellow-400">Pending</div>
            </div>
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-muted-foreground">Loading logs...</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="text-lg font-medium text-muted-foreground mb-2">No logs found</div>
              <div className="text-sm text-muted-foreground">
                {search || statusFilter || dateFilter 
                  ? "Try adjusting your filters" 
                  : "Send your first message to see delivery logs here"
                }
              </div>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted border-b border-border sticky top-0">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">
                  Timestamp
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">
                  Message
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">
                  Phone Number
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">
                  Status
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">
                  Telnyx ID
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log: DeliveryLog & { subscriber: Subscriber | null }) => (
                <tr 
                  key={log.id} 
                  className="hover:bg-muted/50"
                  data-testid={`log-row-${log.id}`}
                >
                  <td className="py-3 px-4 text-sm" data-testid="log-timestamp">
                    {log.updated_at ? formatTimestamp(log.updated_at) : 'Unknown'}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <div 
                      className="max-w-xs truncate text-foreground" 
                      title={log.message_text || ''}
                      data-testid="log-message"
                    >
                      {log.message_text || 'No message text'}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm font-mono text-foreground" data-testid="log-phone">
                    {log.subscriber ? formatPhoneNumber(log.subscriber.phone_number) : 'Unknown'}
                  </td>
                  <td className="py-3 px-4" data-testid="log-status">
                    <StatusBadge status={log.status || 'unknown'} />
                  </td>
                  <td className="py-3 px-4 text-sm font-mono text-muted-foreground" data-testid="log-telnyx-id">
                    {log.telnyx_message_id ? (
                      <span className="truncate block max-w-32" title={log.telnyx_message_id}>
                        {log.telnyx_message_id}
                      </span>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewLog(log)}
                      data-testid={`button-view-${log.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="bg-background border-t border-border p-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground" data-testid="pagination-info">
            Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, pagination.total)} of {pagination.total} logs
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={page <= 1}
              data-testid="button-previous-page"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={page >= pagination.totalPages}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Log Detail Modal */}
      <LogDetailModal
        open={logDetailOpen}
        onOpenChange={setLogDetailOpen}
        log={selectedLog}
      />
    </div>
  );
}
