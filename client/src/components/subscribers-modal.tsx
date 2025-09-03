import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
// ...removed useToast import...
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber, validatePhoneNumber } from "@/lib/supabase";
import { Trash2, X } from "lucide-react";
import type { Subscriber } from "@shared/schema";

interface SubscribersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscribersModal({ open, onOpenChange }: SubscribersModalProps) {
  // Debug: log modal open state
  // ...removed test log...
  const [phoneNumber, setPhoneNumber] = useState("");
  // ...removed toast usage...
  const queryClient = useQueryClient();

  const {
    data: subscribers = [],
    isLoading,
    error: fetchError
  } = useQuery<Subscriber[]>({
    queryKey: ["/api/subscribers"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/subscribers");
      return response.json();
    },
    enabled: open,
  });

  // ...removed error toast...

  const addSubscriberMutation = useMutation({
    mutationFn: async (phone: string) => {
      const response = await apiRequest("POST", "/api/subscribers", {
        phone_number: phone,
        status: "active",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
      setPhoneNumber("");
  // ...removed add success toast...
    },
    onError: (error: any) => {
  // ...removed add error toast...
    },
  });

  const removeSubscriberMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/subscribers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
  // ...removed remove success toast...
    },
    onError: (error: any) => {
  // ...removed remove error toast...
    },
  });

  const handleAddSubscriber = () => {
    if (!phoneNumber.trim()) return;
    if (!validatePhoneNumber(phoneNumber)) {
      window.alert("Please enter a valid phone number");
      return;
    }
    // Enforce E.164 format
    let formatted = phoneNumber.replace(/\D/g, '');
    if (formatted.length === 10) {
      formatted = '+1' + formatted;
    } else if (formatted.length === 11 && formatted.startsWith('1')) {
      formatted = '+' + formatted;
    } else if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    addSubscriberMutation.mutate(formatted);
  };

  const handleRemoveSubscriber = (id: string) => {
    if (confirm("Are you sure you want to remove this subscriber?")) {
      removeSubscriberMutation.mutate(id);
    }
  };

  const formatJoinDate = (joinedAt: string) => {
    const date = new Date(joinedAt);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(openState) => {
        console.log('Dialog onOpenChange:', openState);
        onOpenChange(openState);
        if (!openState) {
          // ...removed debug toast and related lines...
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Manage Subscribers</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add Subscriber */}
          <div className="flex gap-2 p-4 border-b border-border">
            <Input
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddSubscriber();
                }
              }}
              data-testid="input-phone-number"
            />
            <Button 
              onClick={handleAddSubscriber}
              disabled={addSubscriberMutation.isPending}
              data-testid="button-add-subscriber"
            >
              {addSubscriberMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </div>

          {/* Subscribers List */}
          <div className="overflow-y-auto max-h-96 space-y-2">
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">
                Loading subscribers...
              </div>
            ) : subscribers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No subscribers yet. Add your first subscriber above.
              </div>
            ) : (
              <>
                {subscribers.map((subscriber) => (
                  <div 
                    key={subscriber.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50"
                    data-testid={`subscriber-${subscriber.id}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium" data-testid="subscriber-phone">
                        {subscriber.name ? `${subscriber.name} — ` : ''}{formatPhoneNumber(subscriber.phone_number)}
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid="subscriber-join-date">
                        Joined {formatJoinDate(subscriber.joined_at ? subscriber.joined_at.toString() : '')}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={subscriber.status || 'active'} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSubscriber(subscriber.id)}
                        disabled={removeSubscriberMutation.isPending}
                        data-testid={`button-remove-${subscriber.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
