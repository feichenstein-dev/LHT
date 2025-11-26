import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { MessageBubble } from "@/components/ui/message-bubble";
import { SubscribersModal } from "@/components/subscribers-modal";
import { apiRequest, handleApiRefresh } from "@/lib/queryClient";
import { Send, Users } from "lucide-react";
import type { Message, Subscriber } from "@shared/schema";

type StatusCount = {
  message_id: string;
  status: string;
  count: number;
};

if (typeof window !== "undefined") {
  document.documentElement.style.height = "100svh";
  document.body.style.height = "100svh";
  document.body.style.overflow = "hidden";
}

export default function Messages() {
  const [messageText, setMessageText] = useState("");
  const [subscribersModalOpen, setSubscribersModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Auto-refresh on tab focus/visibility and custom events
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-logs"] });
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


  // Fetch status counts for all messages using Supabase RPC
  const { data: statusCountsData = [] } = useQuery<StatusCount[]>({
    queryKey: ["get_status_counts"],
    queryFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.rpc("get_status_counts");
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
  });

  const deliveredCountByMsg: Record<string, number> = {};
  const statusByMsg: Record<string, string> = {};
  if (Array.isArray(statusCountsData)) {
    statusCountsData.forEach((row) => {
      if (!deliveredCountByMsg[row.message_id]) deliveredCountByMsg[row.message_id] = 0;
      if (row.status.toLowerCase() === "delivered") {
        deliveredCountByMsg[row.message_id] = row.count;
        statusByMsg[row.message_id] = "delivered";
      } else if (!statusByMsg[row.message_id]) {
        statusByMsg[row.message_id] = row.status;
      }
    });
  }

  const { data: subscribers = [] } = useQuery<Subscriber[]>({
    queryKey: ["/api/subscribers"],
  });

  const { refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      const response = await apiRequest("POST", "/api/messages", { body, IsLHMessage: true });
      return response.json();
    },
    onSuccess: async (data) => {
      handleApiRefresh(data);
      await queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      await refetchMessages();
      setMessageText("");
      logMessageStatus(data.id, "Success", data);
      // Force a full window refresh to ensure UI updates and scroll to bottom
      setTimeout(() => {
        window.location.reload();
      }, 0);
    },
    onError: (error: any) => {
      logMessageStatus(null, "Error", error);
    },
  });

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim()) return;
    if (subscribers.length === 0) {
      return;
    }
    sendMessageMutation.mutate(messageText);
    setConfirmModalOpen(false);
    // Force a full window refresh immediately after pressing Send
    setTimeout(() => {
      window.location.reload();
    }, 0);
  }, [messageText, subscribers, sendMessageMutation]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (!chatContainerRef.current) return;
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 0);
  }, [messages]);

  const activeSubscribers = subscribers.filter((sub: Subscriber) => sub.status === "active");

  if (messagesLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-0 bg-gradient-to-b from-muted/30 to-muted/10" style={{ height: '100svh', minHeight: '100svh', maxHeight: '100svh', overflow: 'hidden', position: 'fixed', inset: 0, overscrollBehavior: 'none', touchAction: 'none' }}>
      {/* Message List (scrollable) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto scrollbar-none w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', minHeight: 0, paddingBottom: '92px', overscrollBehavior: 'none', WebkitOverflowScrolling: 'touch' }} data-testid="chat-container">
          <div className="flex flex-col items-center w-full min-h-full px-4 pt-4" style={{ minHeight: '100%' }}>
            <div className="w-full max-w-4xl">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="text-lg mb-2">No messages yet</div>
                    <div className="text-sm">Send your first daily inspiration message below!</div>
                  </div>
                ) : (
                  <>
                    {messages
                      .sort((a, b) => new Date(a.sent_at || "").getTime() - new Date(b.sent_at || "").getTime())
                      .map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={<span style={{ whiteSpace: 'pre-wrap' }}>{message.body}</span>}
                          timestamp={
                            message.sent_at
                              ? new Date(message.sent_at).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })
                              : ""
                          }
                          deliveryInfo={{
                            count: deliveredCountByMsg[message.id] || 0,
                            status: (statusByMsg[message.id] as "delivered" | "pending" | "failed") || "pending",
                          }}
                          activeCount={(message as any).current_active_subscribers || 0}
                          deliveredCount={deliveredCountByMsg[message.id] || 0}
                          actions={
                            statusByMsg[message.id] === "failed" && (
                              <Button
                                onClick={() => handleRetryMessage(message.id)}
                                size="sm"
                                variant="outline"
                                className="ml-2"
                              >
                                Retry
                              </Button>
                            )
                          }
                        />
                      ))}
                    {/* Extra space after last message bubble */}
                    <div className="space-y-4" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send Bar (always visible at bottom) */}
      <div className="w-screen border-t border-border bg-background p-3 z-40" style={{ position: 'fixed', bottom: 0, left: 0, width: '100vw' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <div className="bg-muted rounded-3xl px-4 py-2 min-h-[44px] flex items-center">
                <Textarea
                  ref={textareaRef}
                  placeholder="Type your daily lashon hara message..."
                  value={messageText}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent resize-none border-none outline-none shadow-none focus-visible:ring-0 focus:outline-none focus-visible:outline-none text-base min-h-[20px]"
                  rows={1}
                  data-testid="message-input"
                />
              </div>
              <div className="flex justify-between items-center mt-2 px-2">
                <button
                  onClick={() => setSubscribersModalOpen(true)}
                  className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="subscribers-info"
                >
                  <Users className="h-3 w-3" />
                  <span>{activeSubscribers.length} active subscribers</span>
                </button>
                <span className="text-xs text-muted-foreground" data-testid="character-count">
                  {messageText.length}/{/[\u0590-\u05FF]/.test(messageText) ? 670 : 1530} characters
                </span>
              </div>
            </div>
            <Button
              onClick={() => setConfirmModalOpen(true)}
              disabled={
                !messageText.trim() ||
                sendMessageMutation.isPending ||
                activeSubscribers.length === 0 ||
                messageText.length > (/[\u0590-\u05FF]/.test(messageText) ? 670 : 1530)
              }
              size="icon"
              className="rounded-full w-11 h-11 shrink-0"
              data-testid="send-button"
              data-tooltip={
                messageText.length > (/[\u0590-\u05FF]/.test(messageText) ? 670 : 1530)
                  ? "Message exceeds the character limit"
                  : ""
              }
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Subscribers Modal */}
      <SubscribersModal open={subscribersModalOpen} onOpenChange={setSubscribersModalOpen} />

      {/* Confirm Send Modal */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        {confirmModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-40">
            <div
              className="bg-white dark:bg-background rounded-lg shadow-lg p-6"
              style={{
                maxWidth: '90vw',
                width: 900,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                touchAction: 'manipulation',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div className="mb-4 text-lg font-semibold">Send Message?</div>
              <div className="mb-4 text-muted-foreground whitespace-pre-wrap break-words">{messageText}</div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setConfirmModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSendMessage} disabled={sendMessageMutation.isPending}>
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Floating Manage Subscribers Button */}
      <Button
        onClick={() => setSubscribersModalOpen(true)}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg hover:shadow-xl z-40"
        size="icon"
        data-testid="button-manage-subscribers"
      >
        <Users className="h-6 w-6" />
      </Button>
    </div>
  );
}

const logMessageStatus = async (
  messageId: string | null,
  status: string,
  details: any,
  activeCount: number = 0,
  deliveredCount: number = 0
) => {
  const logData = {
    level: "info",
    message: `Message ID: ${messageId}, Status: ${status}, Active Count: ${activeCount}, Delivered Count: ${deliveredCount}`,
    details,
  };

  try {
    await fetch("/api/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(logData),
    });
  } catch (error) {
    console.error("Failed to send log to backend:", error);
  }
};

const handleRetryMessage = (messageId: string) => {
  //console.log(`Retrying message with ID: ${messageId}`);
};