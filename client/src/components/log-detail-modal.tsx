import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPhoneNumber, formatFullTimestamp } from "@/lib/supabase";
import type { DeliveryLog, Subscriber } from "@shared/schema";

interface LogDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: (DeliveryLog & { subscriber: Subscriber | null }) | null;
}

export function LogDetailModal({ open, onOpenChange, log }: LogDetailModalProps) {
  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Delivery Log Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4" data-testid="log-details">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Message ID</label>
            <div className="font-mono text-sm bg-muted rounded p-2 mt-1" data-testid="log-message-id">
              {log.message_id}
            </div>
          </div>
          
          {log.subscriber && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
              <div className="font-mono text-sm bg-muted rounded p-2 mt-1" data-testid="log-phone-number">
                {formatPhoneNumber(log.subscriber.phone_number)}
              </div>
            </div>
          )}
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Message Content</label>
            <div className="text-sm bg-muted rounded p-2 mt-1" data-testid="log-message-content">
              {log.message_text}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <div className="mt-1" data-testid="log-status">
                <StatusBadge status={log.status || 'unknown'} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Direction</label>
              <div className="mt-1 text-sm" data-testid="log-direction">
                {log.direction}
              </div>
            </div>
          </div>
          
          {log.telnyx_message_id && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Telnyx Message ID</label>
              <div className="font-mono text-sm bg-muted rounded p-2 mt-1 break-all" data-testid="log-telnyx-id">
                {log.telnyx_message_id}
              </div>
            </div>
          )}
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
            <div className="text-sm bg-muted rounded p-2 mt-1" data-testid="log-updated-at">
              {log.updated_at ? formatFullTimestamp(log.updated_at) : 'Unknown'}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
