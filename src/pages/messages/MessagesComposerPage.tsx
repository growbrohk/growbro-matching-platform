import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function MessagesComposerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();
  const toOrgId = searchParams.get('toOrg');
  
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [toOrg, setToOrg] = useState<{ name: string; slug?: string | null } | null>(null);

  useEffect(() => {
    if (!toOrgId) {
      setLoadingOrg(false);
      return;
    }

    const fetchOrg = async () => {
      try {
        const { data, error } = await supabase
          .from('orgs')
          .select('id, name, slug')
          .eq('id', toOrgId)
          .single();

        if (error) throw error;
        setToOrg(data);
      } catch (error: any) {
        console.error('Error fetching org:', error);
        toast.error('Failed to load organization');
      } finally {
        setLoadingOrg(false);
      }
    };

    fetchOrg();
  }, [toOrgId]);

  const handleSend = async () => {
    if (!message.trim() || !currentOrg || !toOrgId) return;

    setLoading(true);
    try {
      // Call RPC to get or create conversation
      const { data: conversationId, error: rpcError } = await supabase
        .rpc('get_or_create_conversation', {
          p_org_a: currentOrg.id,
          p_org_b: toOrgId,
        });

      if (rpcError) throw rpcError;
      if (!conversationId) throw new Error('Failed to create conversation');

      // Insert message
      const { error: messageError } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          sender_org_id: currentOrg.id,
          body: message.trim(),
        });

      if (messageError) throw messageError;

      // Navigate to thread view
      navigate(`/messages/${conversationId}`);
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const canSend = message.trim().length > 0 && !loading && currentOrg && toOrgId;

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
          <span className="text-base font-medium">Close</span>
        </Button>
        
        <div className="flex-1 text-center">
          {loadingOrg ? (
            <Loader2 className="h-4 w-4 animate-spin mx-auto" style={{ color: '#0E7A3A' }} />
          ) : (
            <span className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
              {toOrg?.name?.toUpperCase() || 'NEW MESSAGE'}
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          className="text-orange-600 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-base font-medium">Send</span>
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-4">
        {/* Input area */}
        <div className="flex-1 flex flex-col">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message..."
            className="flex-1 min-h-[200px] resize-none border-0 focus-visible:ring-0 text-base"
            style={{ backgroundColor: 'transparent' }}
            maxLength={2000}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

