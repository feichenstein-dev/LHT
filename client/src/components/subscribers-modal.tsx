import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
// ...removed useToast import...
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber, validatePhoneNumber } from "@/lib/supabase";
import { Trash2, X, Edit3, Search } from "lucide-react";
import type { Subscriber } from "@shared/schema";

interface SubscribersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscribersModal({ open, onOpenChange }: SubscribersModalProps) {
  // Debug: log modal open state
  // ...removed test log...
  const [phoneNumber, setPhoneNumber] = useState("");
  const [subscriberName, setSubscriberName] = useState("");
  const [editingSubscriber, setEditingSubscriber] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // ...removed toast usage...
  // (keep only one set of these variables, defined below)
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
      const data = await response.json();
      return data.sort((a: Subscriber, b: Subscriber) => (a.name || "").localeCompare(b.name || ""));
    },
    enabled: open,
  });
  // Filter subscribers by search term (name or phone number)
  const filteredSubscribers = subscribers.filter((subscriber) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    const name = (subscriber.name || '').toLowerCase();
    const nameMatch = name.includes(searchLower);
    // Only use digit filtering for phone number search
    const phone = (subscriber.phone_number || '').replace(/\D/g, '');
    const searchDigits = searchTerm.replace(/\D/g, '');
    const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
    return nameMatch || phoneMatch;
  });

  // ...removed error toast...

  const addSubscriberMutation = useMutation({
    mutationFn: async ({ phone, name }: { phone: string; name: string }) => {
      const response = await apiRequest("POST", "/api/subscribers", {
        phone_number: phone,
        name,
        status: "active",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
      setPhoneNumber("");
      setSubscriberName("");
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

  const reactivateSubscriberMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        console.log("Sending PATCH request to reactivate subscriber:", {
          url: `/api/subscribers/${id}`,
          method: "PATCH",
          body: { status: "active" },
        });

        const response = await apiRequest("PATCH", `/api/subscribers/${id}`, { status: "active" });
        const contentType = response.headers.get("content-type");

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error Response:", {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: errorText,
          });
          throw new Error(`Failed to reactivate subscriber with ID: ${id}`);
        }

        if (contentType && contentType.includes("application/json")) {
          return response.json();
        } else {
          const errorText = await response.text();
          console.error("Unexpected Response Format:", {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: errorText,
          });
          throw new Error("Unexpected response format from server.");
        }
      } catch (error) {
        console.error("Error during API call:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
      console.log("Subscriber reactivated successfully.");
    },
    onError: (error: any) => {
      console.error("Failed to reactivate subscriber:", error);
      window.alert("Failed to reactivate subscriber. Please try again.");
    },
  });

  const updateSubscriberNameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/subscribers/${id}/name`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
      setEditingSubscriber(null);
      setEditingName("");
    },
    onError: (error: any) => {
      console.error("Failed to update subscriber name:", error);
      window.alert("Failed to update subscriber name. Please try again.");
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
    addSubscriberMutation.mutate({ phone: formatted, name: subscriberName.trim() });
  };

  const handleRemoveSubscriber = (id: string) => {
    if (confirm("Are you sure you want to remove this subscriber?")) {
      removeSubscriberMutation.mutate(id);
    }
  };

  const handleReactivateSubscriber = (id: string) => {
    if (confirm("Are you sure you want to reactivate this subscriber?")) {
      reactivateSubscriberMutation.mutate(id);
    }
  };

  const handleEditSubscriber = (id: string, name: string) => {
    setEditingSubscriber(id);
    setEditingName(name);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingSubscriber(null);
    setEditingName("");
  };

  const handleUpdateSubscriberName = () => {
    if (editingSubscriber && editingName.trim()) {
      updateSubscriberNameMutation.mutate({ id: editingSubscriber, name: editingName.trim() }, {
        onSuccess: () => {
          handleCloseEditModal();
        },
      });
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

  const activeSubscribers = subscribers.filter((subscriber) => subscriber.status === "active").length;
  const inactiveSubscribers = subscribers.filter((subscriber) => subscriber.status === "inactive").length;

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
          <div className="flex flex-row items-center w-full gap-2">
            <div className="flex-1 min-w-0 pt-10">
              <DialogTitle>Manage Subscribers</DialogTitle>
              <div className="text-sm text-muted-foreground">
                Active: {activeSubscribers} | Inactive: {inactiveSubscribers}
              </div>
            </div>
            {/* Search Bar Top Right, with max-w-xs to avoid overlap */}
            <div className="relative flex items-center max-w-xs w-full pt-10">
              <Input
                type="text"
                placeholder="Search by name or phone number"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/40 bg-white"
                data-testid="input-search-subscribers"
                style={{ minWidth: 0, width: '100%' }}
              />
              <span className="absolute left-3 text-gray-400 pointer-events-none">
                <Search className="w-5 h-5" />
              </span>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add Subscriber */}
          <div className="flex flex-col md:flex-row gap-2 p-4 border-b border-border items-center">
          <Input
              type="text"
              placeholder="Name"
              value={subscriberName}
              onChange={(e) => setSubscriberName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddSubscriber();
                }
              }}
              data-testid="input-subscriber-name"
              className="flex-1 min-w-0"
            />            
            <Input
              type="tel"
              placeholder="Phone Number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddSubscriber();
                }
              }}
              data-testid="input-phone-number"
              className="flex-1 min-w-0"
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
            ) : filteredSubscribers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No subscribers found.
              </div>
            ) : (
              <>
                {filteredSubscribers.map((subscriber) => (
                  <div 
                    key={subscriber.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50"
                    data-testid={`subscriber-${subscriber.id}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2" data-testid="subscriber-phone">
                        {subscriber.name && (
                          <span className="rounded bg-gray-100 px-2 py-1 text-gray-800 font-semibold text-sm">
                            {subscriber.name}
                          </span>
                        )}
                        <span className="text-gray-500 text-sm tracking-wide">
                          {formatPhoneNumber(subscriber.phone_number)}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid="subscriber-join-date">
                        Joined {formatJoinDate(subscriber.joined_at ? subscriber.joined_at.toString() : '')}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={subscriber.status || 'active'} />
                      {subscriber.status === 'inactive' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivateSubscriber(subscriber.id)}
                          data-testid={`button-reactivate-${subscriber.id}`}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditSubscriber(subscriber.id, subscriber.name || "")}
                            data-testid={`button-edit-${subscriber.id}`}
                          >
                            <Edit3 className="h-4 w-4 text-gray-400 hover:text-gray-700 transition-colors" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSubscriber(subscriber.id)}
                            disabled={removeSubscriberMutation.isPending}
                            data-testid={`button-remove-${subscriber.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-gray-700 transition-colors" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </DialogContent>
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscriber</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="Enter new name"
            />
            <div className="flex justify-end space-x-2">
              <Button
                onClick={handleUpdateSubscriberName}
                disabled={updateSubscriberNameMutation.isPending}
              >
                {updateSubscriberNameMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" onClick={handleCloseEditModal}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
