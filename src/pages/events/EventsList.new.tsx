import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight } from 'lucide-react';

export default function EventsList() {
  return (
    <div className="max-w-7xl space-y-6 md:space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Events & Ticketing
        </h1>
        <p className="mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Manage your events and ticket sales
        </p>
      </div>

      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardContent className="flex flex-col items-center justify-center py-16 p-4 md:p-6">
          <Calendar className="h-16 w-16 mb-4" style={{ color: '#0E7A3A', opacity: 0.3 }} />
          <h3 className="text-xl font-semibold mb-2" style={{ color: '#0F1F17' }}>
            Events Coming Soon
          </h3>
          <p className="text-center text-muted-foreground mb-6 max-w-md">
            Event management and ticketing system is being rebuilt with improved features and better organization support.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" disabled>
              <Calendar className="mr-2 h-4 w-4" />
              Create Event (Coming Soon)
            </Button>
            <a href="https://github.com/yourusername/yourrepo/issues" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost">
                View Roadmap
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3" style={{ color: '#0F1F17' }}>
            What's New in Events 2.0
          </h3>
          <ul className="space-y-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span><strong>Organization-based:</strong> Events are managed at the organization level</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span><strong>Flexible ticket types:</strong> Create multiple ticket tiers with different pricing and quotas</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span><strong>Order management:</strong> Track orders and ticket sales in one place</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span><strong>QR code tickets:</strong> Each ticket gets a unique QR code for check-in</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span><strong>Venue partnerships:</strong> Associate events with venue organizations</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

