import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-600 text-white';
      case 'sent':
        return 'bg-primary text-primary-foreground';
      case 'failed':
        return 'bg-destructive text-destructive-foreground';
      case 'pending':
        return 'bg-yellow-600 text-white';
      case 'active':
        return 'bg-green-600 text-white';
      case 'inactive':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <span 
      className={cn(
        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
        getStatusStyles(status),
        className
      )}
      data-testid={`status-${status}`}
    >
      {status}
    </span>
  );
}
