import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Profile, Match, Message } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Send,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface Conversation {
  match: Match;
  otherProfile: Profile;
  lastMessage?: Message;
}

export default function Messages() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, [profile]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.match.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!selectedConversation) return;

    const channel = supabase
      .channel(`messages-${selectedConversation.match.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${selectedConversation.match.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversation]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch matches where user is involved
      const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .or(`user_one_id.eq.${profile.id},user_two_id.eq.${profile.id}`)
        .order('created_at', { ascending: false });

      if (matchError) throw matchError;

      // Get other user IDs
      const otherUserIds = (matches as Match[])?.map((m) =>
        m.user_one_id === profile.id ? m.user_two_id : m.user_one_id
      ) || [];

      if (otherUserIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherUserIds);

      const profileMap = new Map((profiles as Profile[])?.map((p) => [p.id, p]));

      // Build conversations
      const convos: Conversation[] = (matches as Match[])?.map((match) => {
        const otherId = match.user_one_id === profile.id ? match.user_two_id : match.user_one_id;
        return {
          match,
          otherProfile: profileMap.get(otherId)!,
        };
      }).filter((c) => c.otherProfile) || [];

      setConversations(convos);
      if (convos.length > 0 && !selectedConversation) {
        setSelectedConversation(convos[0]);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (matchId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    setMessages((data as Message[]) || []);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedConversation || !newMessage.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        match_id: selectedConversation.match.id,
        sender_user_id: profile.id,
        body: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Messages</h1>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <Card className="text-center py-16">
            <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No conversations yet</h2>
            <p className="text-muted-foreground mb-6">
              Match with other users to start chatting
            </p>
            <Link to="/home">
              <Button variant="hero">Find Matches</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 h-[calc(100vh-16rem)]">
            {/* Conversations List */}
            <Card className="md:col-span-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                {conversations.map((convo) => (
                  <button
                    key={convo.match.id}
                    onClick={() => setSelectedConversation(convo)}
                    className={cn(
                      'w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b',
                      selectedConversation?.match.id === convo.match.id && 'bg-muted'
                    )}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={convo.otherProfile.avatar_url} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {convo.otherProfile.display_name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{convo.otherProfile.display_name}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        @{convo.otherProfile.handle}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Messages */}
            <Card className="md:col-span-2 flex flex-col overflow-hidden">
              {selectedConversation ? (
                <>
                  {/* Header */}
                  <div className="p-4 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={selectedConversation.otherProfile.avatar_url} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {selectedConversation.otherProfile.display_name?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-medium">{selectedConversation.otherProfile.display_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          @{selectedConversation.otherProfile.handle}
                        </p>
                      </div>
                    </div>
                    <Link to={`/profiles/${selectedConversation.otherProfile.handle}`}>
                      <Button variant="outline" size="sm">View Profile</Button>
                    </Link>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <p>No messages yet. Say hello! 👋</p>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex',
                            msg.sender_user_id === profile?.id ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div
                            className={cn(
                              'max-w-[70%] px-4 py-2 rounded-2xl',
                              msg.sender_user_id === profile?.id
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-muted rounded-bl-sm'
                            )}
                          >
                            <p className="text-sm">{msg.body}</p>
                            <p className={cn(
                              'text-xs mt-1',
                              msg.sender_user_id === profile?.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            )}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="submit" disabled={sending || !newMessage.trim()}>
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  Select a conversation
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
