import { useState, useRef, useEffect } from "react";
// ...removed useToast import...
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageBubble } from "@/components/ui/message-bubble";
import { SubscribersModal } from "@/components/subscribers-modal";
import { apiRequest } from "@/lib/queryClient";
import { formatTimestamp } from "@/lib/supabase";
import { Send, Users } from "lucide-react";
import type { Message, Subscriber } from "@shared/schema";

export default function Messages() {
  const [messageText, setMessageText] = useState("");
  const [subscribersModalOpen, setSubscribersModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // ...removed toast usage...
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    select: (msgs) => [...msgs].sort((a, b) => new Date(a.sent_at || '').getTime() - new Date(b.sent_at || '').getTime()),
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
      // Fetch delivery logs for this message
      const logsRes = await apiRequest("GET", `/api/delivery-logs?message_id=${data.message.id}`);
      const logs = await logsRes.json();
      const delivered = logs.logs.filter((l: any) => l.status === 'delivered').length;
      const failed = logs.logs.filter((l: any) => l.status === 'failed').length;
      window.alert(`Message sent to ${delivered} contacts, failed to send to ${failed} contacts`);
    },
    onError: (error: any) => {
      window.alert(error.message || "Failed to send message");
    },
  });

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    
    if (subscribers.length === 0) {
      window.alert("Add subscribers before sending messages");
      return;
    }

    sendMessageMutation.mutate(messageText);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const activeSubscribers = subscribers.filter((sub: Subscriber) => sub.status === 'active');

  if (messagesLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Container */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto bg-gradient-to-b from-muted/30 to-muted/10 p-4"
        data-testid="chat-container"
      >
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-lg mb-2">No messages yet</div>
              <div className="text-sm">Send your first daily inspiration message below!</div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message.body}
                timestamp={
                  message.sent_at
                    ? new Date(message.sent_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : ''
                }
                deliveryInfo={{
                  count: activeSubscribers.length,
                  status: 'delivered', // This would come from delivery logs in a real implementation
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Message Input Area */}
      <div className="border-t border-border bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <div className="bg-muted rounded-3xl px-4 py-2 min-h-[44px] flex items-center">
                <Textarea
                  ref={textareaRef}
                  placeholder="Type your daily inspiration message..."
                  value={messageText}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent resize-none border-none outline-none shadow-none focus-visible:ring-0 text-base min-h-[20px]"
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
                  <span>{activeSubscribers.length} subscribers</span>
                </button>
                <span className="text-xs text-muted-foreground" data-testid="character-count">
                  {messageText.length}/160 characters
                </span>
              </div>
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || sendMessageMutation.isPending || activeSubscribers.length === 0}
              size="icon"
              className="rounded-full w-11 h-11 shrink-0"
              data-testid="send-button"
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

      {/* Floating Action Button for Subscribers */}
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
