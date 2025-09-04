import { cn } from "@/lib/utils";

// Utility function to calculate message length based on encoding
const calculateMessageLength = (message: string): number => {
  const isHebrew = /[\u0590-\u05FF]/.test(message);
  return isHebrew ? message.length * 2 : message.length;
};

interface MessageBubbleProps {
  message: string;
  timestamp: string;
  deliveryInfo?: {
    count: number;
    status: 'delivered' | 'failed' | 'pending';
  };
  actions?: React.ReactNode;
  activeCount?: number; // Added activeCount prop
  deliveredCount?: number; // Added deliveredCount prop
  className?: string;
}

export function MessageBubble({ 
  message, 
  timestamp, 
  deliveryInfo, 
  actions, 
  activeCount, // Added activeCount prop
  deliveredCount, // Added deliveredCount prop
  className 
}: MessageBubbleProps) {
  const messageLength = calculateMessageLength(message);

  console.debug('MessageBubble Active Count:', activeCount, 'Delivered Count:', deliveredCount);

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
            className="text-xs text-muted-foreground"
            data-testid="delivery-info"
          >
            {`${deliveredCount || 0} delivered / ${activeCount || 0} active subscribers`}
          </span>
          {deliveryInfo.status === 'delivered' && (
            <i className="fas fa-check-double text-xs text-green-500" />
          )}
          {deliveryInfo.status === 'failed' && (
            <i className="fas fa-exclamation-triangle text-xs text-destructive" />
          )}
        </div>
      )}
      {actions && (
        <div className="mt-2">
          {actions}
        </div>
      )}
    </div>
  );
}
