import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Handshake, Calendar, Coffee, Link2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Collab() {
  const collabSections = [
    {
      icon: Calendar,
      title: 'Consignment',
      description: 'Manage consignment partnerships with retail locations',
      status: 'Coming Soon',
    },
    {
      icon: Coffee,
      title: 'Cup Sleeve',
      description: 'Create cup sleeve advertising campaigns with coffee shops',
      status: 'Coming Soon',
    },
    {
      icon: Sparkles,
      title: 'Events',
      description: 'Collaborate on pop-ups, markets, and special events',
      status: 'Coming Soon',
    },
    {
      icon: Link2,
      title: 'Affiliate Links',
      description: 'Set up affiliate partnerships and track referrals',
      status: 'Coming Soon',
    },
  ];

  return (
    <div className="max-w-5xl space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.1)' }}>
            <Handshake className="h-5 w-5" style={{ color: '#0E7A3A' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Collab
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Manage partnerships and collaborations between brands and venues
        </p>
      </div>

      {/* Collab Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {collabSections.map((section) => {
          const Icon = section.icon;
          return (
            <Card 
              key={section.title}
              className="rounded-3xl border shadow-xl hover:shadow-2xl transition-all" 
              style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
            >
              <CardHeader className="p-4 md:p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                        <Icon className="h-5 w-5" style={{ color: '#0E7A3A' }} />
                      </div>
                      <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                        {section.title}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-sm">
                      {section.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(14,122,58,0.08)', color: '#0E7A3A' }}>
                    {section.status}
                  </span>
                  <Button variant="ghost" size="sm" disabled>
                    Learn More
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Card */}
      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardContent className="p-4 md:p-6">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
              <Sparkles className="h-4 w-4" style={{ color: '#0E7A3A' }} />
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                Collaboration Features Coming Soon
              </h3>
              <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                We're building powerful tools to help brands and venues collaborate more effectively. 
                These features will enable consignment tracking, cup sleeve campaigns, event partnerships, 
                and affiliate programs all in one place.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

