import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function EventForm() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/events')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F1F17' }}>
            Create Event
          </h1>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Event creation coming soon
          </p>
        </div>
      </div>

      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Event management is being rebuilt. Please check back later.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

