import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MoreVertical, Plus, Send, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import ActionSheet from '@/components/messages/ActionSheet';
import ThreadActionSheet from '@/components/messages/ThreadActionSheet';
import { useUnreadEnquiriesCount } from '@/hooks/use-unread-enquiries-count';

interface Message {
  id: string;
  conversation_id: string;
  sender_org_id: string;
  body: string;
  created_at: string;
}

interface OtherOrg {
  id: string;
  name: string;
  slug: string | null;
  profile: {
    category: string;
    address: string;
    logo_url: string | null;
  } | null;
}

export default function MessagesThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const { refetch: refetchUnreadCount } = useUnreadEnquiriesCount();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherOrg, setOtherOrg] = useState<OtherOrg | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [plusSheetOpen, setPlusSheetOpen] = useState(false);
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);

  useEffect(() => {
    if (!conversationId || !currentOrg) return;

    let cancelled = false;

    const load = async () => {
      if (!conversationId || !currentOrg) return;

      try {
        setLoading(true);

        const { data: participants, error: participantsError } = await supabase
          .from('conversation_participants')
          .select('org_id')
          .eq('conversation_id', conversationId);

        if (cancelled) return;
        if (participantsError) throw participantsError;

        const otherOrgId = participants?.find((p) => p.org_id !== currentOrg.id)?.org_id;
        if (!otherOrgId) {
          toast.error('Conversation not found');
          navigate('/app/enquiries');
          return;
        }

        const [{ data: orgData, error: orgError }, { data: messagesData, error: messagesError }] =
          await Promise.all([
            supabase
              .from('orgs')
              .select(`
          id,
          name,
          slug,
          org_profiles(category, address, logo_url)
        `)
              .eq('id', otherOrgId)
              .single(),
            supabase
              .from('conversation_messages')
              .select('*')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: true }),
          ]);

        if (cancelled) return;
        if (orgError) throw orgError;
        if (messagesError) throw messagesError;

        const profileData = Array.isArray(orgData.org_profiles)
          ? orgData.org_profiles[0]
          : orgData.org_profiles;

        setOtherOrg({
          id: orgData.id,
          name: orgData.name,
          slug: orgData.slug,
          profile: profileData || null,
        });
        setMessages(messagesData || []);

        await supabase
          .from('conversation_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('conversation_id', conversationId)
          .eq('org_id', currentOrg.id);

        if (!cancelled) {
          refetchUnreadCount();
        }
      } catch (error: unknown) {
        console.error('Error loading conversation:', error);
        if (!cancelled) {
          toast.error('Failed to load conversation');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [conversationId, currentOrg, navigate, refetchUnreadCount]);

  const reloadMessages = async () => {
    if (!conversationId) return;
    const { data: messagesData, error: messagesError } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (messagesError) throw messagesError;
    setMessages(messagesData || []);
  };

  const handleSend = async () => {
    if (!message.trim() || !currentOrg || !conversationId) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          sender_org_id: currentOrg.id,
          body: message.trim(),
        });

      if (error) throw error;

      setMessage('');
      await reloadMessages();
    } catch (error: unknown) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatMessageDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return format(date, 'd MMM yyyy • h:mm a');
    } catch {
      return '';
    }
  };

  const canSend = message.trim().length > 0 && !sending && currentOrg && conversationId;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!otherOrg) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm" style={{ color: '#0F1F17' }}>Conversation not found</p>
          <Button onClick={() => navigate('/app/enquiries')} className="mt-4">
            Go to Enquiries
          </Button>
        </div>
      </div>
    );
  }

  const category = otherOrg.profile?.category?.toUpperCase() || '';
  const location = otherOrg.profile?.address || '';
  const categoryLocation = [category, location].filter(Boolean).join(', ');

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="text-orange-600 hover:text-orange-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1 text-center">
          <div className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
            {otherOrg.name.toUpperCase()}
          </div>
          {categoryLocation && (
            <div className="text-xs mt-0.5" style={{ color: 'rgba(15,31,23,0.6)' }}>
              {categoryLocation}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMenuSheetOpen(true)}
          className="text-orange-600 hover:text-orange-700"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_org_id === currentOrg?.id;
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  {!isOwn && otherOrg.profile?.logo_url ? (
                    <AvatarImage src={otherOrg.profile.logo_url} alt={otherOrg.name} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    {!isOwn ? otherOrg.name.slice(0, 2).toUpperCase() : (currentOrg?.name.slice(0, 2).toUpperCase() || 'ME')}
                  </AvatarFallback>
                </Avatar>
                <div className={`flex-1 ${isOwn ? 'text-right' : ''}`}>
                  <div className="inline-block max-w-[80%] rounded-2xl p-3" style={{ backgroundColor: isOwn ? 'rgba(14,122,58,0.1)' : 'rgba(15,31,23,0.05)' }}>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: '#0F1F17' }}>
                      {msg.body}
                    </p>
                  </div>
                  <div className={`text-xs mt-1 ${isOwn ? 'text-right' : ''}`} style={{ color: 'rgba(15,31,23,0.6)' }}>
                    {formatMessageDate(msg.created_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Bar */}
      <div className="border-t p-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPlusSheetOpen(true)}
            className="flex-shrink-0"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message..."
            className="flex-1 min-h-[44px] max-h-[120px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && canSend) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={2000}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 text-orange-600 hover:text-orange-700 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Action Sheets */}
      <ActionSheet
        open={plusSheetOpen}
        onOpenChange={setPlusSheetOpen}
        conversationId={conversationId || ''}
      />
      <ThreadActionSheet
        open={menuSheetOpen}
        onOpenChange={setMenuSheetOpen}
        otherOrgId={otherOrg.id}
        otherOrgSlug={otherOrg.slug}
      />
    </div>
  );
}

