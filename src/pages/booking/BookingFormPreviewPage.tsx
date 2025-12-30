import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import BookingFormRenderer from '@/components/booking/BookingFormRenderer';

export default function BookingFormPreviewPage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  if (!resourceId) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center text-destructive">
        Invalid preview URL
      </div>
    );
  }
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resourceId) {
      fetchFields();
    }
    // eslint-disable-next-line
  }, [resourceId]);

  const fetchFields = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('booking_form_fields')
        .select('*')
        .eq('resource_id', resourceId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setFields(data);
    } catch (err: any) {
      setError('Failed to load form fields');
      toast.error(err.message || 'Failed to fetch fields');
      setFields([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Booking Form Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center text-destructive py-10">{error}</div>
          ) : fields.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">
              No fields configured for this resource.
            </div>
          ) : (
            <BookingFormRenderer fields={fields} mode="preview" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

