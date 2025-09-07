import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageBubble } from "@/components/ui/message-bubble";
import { SubscribersModal } from "@/components/subscribers-modal";
import { apiRequest } from "@/lib/queryClient";
import { formatTimestamp } from "@/lib/supabase";
import { Send, Users } from "lucide-react";
import type { Message, Subscriber } from "@shared/schema";

type ExtendedMessage = Message & {
  current_active_subscribers?: number;
  status: "delivered" | "failed" | "pending" | "unknown";
};


// Prevent iPad/mobile page scroll by setting html/body height and overflow
if (typeof window !== "undefined") {
  document.documentElement.style.height = "100svh";
  document.body.style.height = "100svh";
  document.body.style.overflow = "hidden";
}

export default function Messages() {
  const [messageText, setMessageText] = useState("");
  const [subscribersModalOpen, setSubscribersModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ExtendedMessage[]>({
    queryKey: ["/api/messages"],
    select: (msgs: ExtendedMessage[]) =>
      msgs
        .map((msg: ExtendedMessage) => ({
          ...msg,
          delivered_count: msg.delivered_count || 0,
          current_active_subscribers: msg.current_active_subscribers || 0,
          status: msg.status || "unknown",
        }))
        .sort((a, b) => new Date(a.sent_at || "").getTime() - new Date(b.sent_at || "").getTime()),
  });

  const { data: subscribers = [] } = useQuery<Subscriber[]>({
    queryKey: ["/api/subscribers"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      const response = await apiRequest("POST", "/api/messages", { body });
      return response.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-logs"] });
      setMessageText("");
      logMessageStatus(data.id, "Success", data);
    },
    onError: (error: any) => {
      logMessageStatus(null, "Error", error);
    },
  });

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    if (subscribers.length === 0) {
      return;
    }
    sendMessageMutation.mutate(messageText);
  };

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
      handleSendMessage();
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
    <div
      className="flex flex-col w-full min-h-0 bg-gradient-to-b from-muted/30 to-muted/10"
      style={{
        height: '100svh',
        minHeight: '100svh',
        maxHeight: '100svh',
        overflow: 'hidden',
        position: 'fixed',
        inset: 0,
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
    >
  {/* ...header removed, handled by App navigation... */}
      {/* Message List (scrollable) */}
  <div className="flex-1 flex flex-col min-h-0">
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto scrollbar-none px-4 pt-4 max-w-4xl mx-auto w-full"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            minHeight: 0,
            paddingBottom: '92px',
            overscrollBehavior: 'none',
          }}
          data-testid="chat-container"
        >
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="text-lg mb-2">No messages yet</div>
                <div className="text-sm">Send your first daily inspiration message below!</div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message.body}
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
                      count: message.delivered_count || 0,
                      status: message.status || "pending",
                    }}
                    activeCount={message.current_active_subscribers || 0}
                    deliveredCount={message.delivered_count || 0}
                    actions={
                      message.status === "failed" && (
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

      {/* Send Bar (always visible at bottom) */}
      <div
        className="w-screen border-t border-border bg-background p-3 z-40"
        style={{ position: 'fixed', bottom: 0, left: 0, width: '100vw' }}
      >
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
              onClick={handleSendMessage}
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
      <SubscribersModal
        open={subscribersModalOpen}
        onOpenChange={setSubscribersModalOpen}
      />

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
  console.log(`Retrying message with ID: ${messageId}`);
};