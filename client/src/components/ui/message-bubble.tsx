import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: string;
  timestamp: string;
  deliveryInfo?: {
    count: number;
    status: 'delivered' | 'failed' | 'pending';
  };
  className?: string;
}

export function MessageBubble({ 
  message, 
  timestamp, 
  deliveryInfo, 
  className 
}: MessageBubbleProps) {
  return (
    <div className="flex flex-col items-end">
      <div 
        className={cn(
          "message-bubble sent rounded-2xl px-4 py-2 mb-1 max-w-[85%] break-words",
          "bg-primary text-primary-foreground",
          deliveryInfo?.status === 'failed' && "opacity-70",
          className
        )}
        data-testid="message-bubble"
      >
        {message}
      </div>
      <span 
        className="text-xs text-muted-foreground"
        data-testid="message-timestamp"
      >
        {timestamp}
      </span>
      {deliveryInfo && (
        <div className="flex items-center mt-1 space-x-1">
          <span 
            className={cn(
              "text-xs",
              deliveryInfo.status === 'failed' ? "text-destructive" : "text-muted-foreground"
            )}
            data-testid="delivery-info"
          >
            {deliveryInfo.status === 'failed' 
              ? `Failed to send to ${deliveryInfo.count} contacts`
              : `Delivered to ${deliveryInfo.count} contacts`
            }
          </span>
          {deliveryInfo.status === 'delivered' && (
            <i className="fas fa-check-double text-xs text-green-500" />
          )}
          {deliveryInfo.status === 'failed' && (
            <i className="fas fa-exclamation-triangle text-xs text-destructive" />
          )}
        </div>
      )}
    </div>
  );
}
