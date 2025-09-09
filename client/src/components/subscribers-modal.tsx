import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber, validatePhoneNumber } from "@/lib/supabase";
import { Trash2, Edit3, Search } from "lucide-react";
import type { Subscriber } from "@shared/schema";

interface SubscribersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscribersModal({ open, onOpenChange }: SubscribersModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [subscriberName, setSubscriberName] = useState("");
  const [editingSubscriber, setEditingSubscriber] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "joined_at">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

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
      return data;
    },
    enabled: open,
  });

  // Filter + sort
  const filteredSubscribers = subscribers
    .filter((subscriber) => {
      if (!searchTerm.trim()) return true;
      const searchLower = searchTerm.toLowerCase();
      const name = (subscriber.name || '').toLowerCase();
      const nameMatch = name.includes(searchLower);
      const phone = (subscriber.phone_number || '').replace(/\D/g, '');
      const searchDigits = searchTerm.replace(/\D/g, '');
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      return nameMatch || phoneMatch;
    })
    .sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      if (sortBy === "name") {
        aVal = (a.name || a.phone_number || "").toLowerCase();
        bVal = (b.name || b.phone_number || "").toLowerCase();
      } else if (sortBy === "joined_at") {
        aVal = a.joined_at ? new Date(a.joined_at).getTime() : 0;
        bVal = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

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
    },
  });

  const removeSubscriberMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/subscribers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
    },
  });

  const reactivateSubscriberMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/subscribers/${id}`, { status: "active" });
      if (!response.ok) throw new Error("Failed to reactivate");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribers"] });
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
  });

  const handleAddSubscriber = () => {
    if (!phoneNumber.trim()) return;
    if (!validatePhoneNumber(phoneNumber)) {
      window.alert("Please enter a valid phone number");
      return;
    }
    // Sanitize subscriber name: remove non-alpha chars from start/end, keep internal whitespace
    const sanitizedName = subscriberName
      .replace(/^[^A-Za-z]+/, '')
      .replace(/[^A-Za-z]+$/, '');
    let formatted = phoneNumber.replace(/\D/g, '');
    if (formatted.length === 10) {
      formatted = '+1' + formatted;
    } else if (formatted.length === 11 && formatted.startsWith('1')) {
      formatted = '+' + formatted;
    } else if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    addSubscriberMutation.mutate({ phone: formatted, name: sanitizedName });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl w-full p-0"
        style={{
          padding: 32,
          position: 'fixed',
          top: '4vh',
          left: '50%',
          transform: 'translateX(-50%)',
          maxHeight: '92vh',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          touchAction: 'manipulation',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <DialogHeader>
          <DialogTitle>Manage Subscribers</DialogTitle>
          <div className="text-sm text-muted-foreground mb-2">
            Active: {activeSubscribers} | Inactive: {inactiveSubscribers}
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
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubscriber(); }}
              data-testid="input-subscriber-name"
              className="flex-1 min-w-0"
              tabIndex={-1}
            />
            <Input
              type="tel"
              placeholder="Phone Number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubscriber(); }}
              data-testid="input-phone-number"
              className="flex-1 min-w-0"
              tabIndex={-1}
            />
            <Button onClick={handleAddSubscriber} disabled={addSubscriberMutation.isPending} data-testid="button-add-subscriber">
              {addSubscriberMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-col sm:flex-row gap-2 w-full items-center justify-between pb-2" style={{paddingLeft: 0, paddingRight: 0}}>
            <div className="relative flex-1 w-full max-w-md" style={{paddingLeft: 0}}>
              <Input
                type="text"
                placeholder="Search by name or phone number"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/40 bg-white"
                data-testid="input-search-subscribers"
                style={{ minWidth: 0, width: '100%' }}
                tabIndex={-1}
              />
              <span className="absolute left-3 top-2.5 text-gray-400 pointer-events-none">
                <Search className="w-5 h-5" />
              </span>
            </div>
            <div className="flex flex-row gap-2 items-center w-full sm:w-auto">
              <span className="text-xs text-muted-foreground font-medium mr-1">Sort:</span>
              <Select value={sortBy} onValueChange={(val) => setSortBy(val as "name" | "joined_at")}> 
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="joined_at">Subscribed Date</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                aria-label={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="ml-1 text-lg flex items-center bg-transparent border-none shadow-none hover:bg-transparent focus:outline-none"
                style={{ minWidth: 24, padding: 0, boxShadow: 'none' }}
              >
                {sortOrder === 'asc' ? <span title="Ascending" style={{fontSize:18,lineHeight:1}}>&uarr;</span> : <span title="Descending" style={{fontSize:18,lineHeight:1}}>&darr;</span>}
              </button>
            </div>
          </div>

          {/* Subscribers List */}
          <div className="overflow-y-auto bg-white rounded-lg space-y-2" style={{ maxHeight: '70vh', paddingBottom: 48 }}>
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading subscribers...</div>
            ) : filteredSubscribers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No subscribers found.</div>
            ) : (
              <>
                {filteredSubscribers.map((subscriber) => (
                  <div
                    key={subscriber.id}
                    className="flex items-center justify-between p-2 border border-border rounded-lg hover:bg-muted/50"
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
                <div style={{ minHeight: 40, pointerEvents: 'none' }} />
              </>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Edit Subscriber Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent style={{ top: '10vh', left: '50%', transform: 'translateX(-50%)', position: 'fixed', maxWidth: 400, width: '90vw' }}>
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
              <Button onClick={handleUpdateSubscriberName} disabled={updateSubscriberNameMutation.isPending}>
                {updateSubscriberNameMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" onClick={handleCloseEditModal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
