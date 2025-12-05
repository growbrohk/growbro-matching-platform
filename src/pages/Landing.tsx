import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CollabChip } from "@/components/CollabChip";
import { 
  Store, 
  Users, 
  Handshake, 
  Calendar, 
  Package, 
  Coffee,
  UserPlus,
  Search,
  Send,
  ChevronDown,
  Instagram,
  ExternalLink
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Landing() {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
                <Handshake className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg text-foreground">Growbro Collab Hub</span>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/auth">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link to="/auth">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                Match brands and venues for{" "}
                <span className="text-primary">real-world collaborations</span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Growbro Collab Hub is a "business collab Tinder" that helps brands and venues match for consignment, events, collab products, and cup sleeve marketing — all in one place.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/auth">
                  <Button size="xl" variant="hero" className="w-full sm:w-auto">
                    Get started – it's free
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="xl" 
                  onClick={() => scrollToSection('how-it-works')}
                  className="gap-2"
                >
                  View how it works
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {/* Mock UI Preview */}
            <div className="relative">
              <div className="bg-card rounded-3xl p-6 shadow-xl border border-border">
                <div className="text-center mb-6">
                  <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                    It's a match! 🎉
                  </span>
                </div>
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="w-20 h-20 bg-secondary rounded-2xl flex items-center justify-center">
                    <Store className="w-10 h-10 text-secondary-foreground" />
                  </div>
                  <div className="text-3xl">❤️</div>
                  <div className="w-20 h-20 bg-accent rounded-2xl flex items-center justify-center">
                    <Coffee className="w-10 h-10 text-accent-foreground" />
                  </div>
                </div>
                <div className="text-center mb-6">
                  <p className="font-semibold text-foreground">Local Coffee Co. & Urban Streetwear</p>
                  <p className="text-sm text-muted-foreground">Both interested in collaborating</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <CollabChip type="consignment" size="sm" />
                  <CollabChip type="event" size="sm" />
                  <CollabChip type="collab_product" size="sm" />
                  <CollabChip type="cup_sleeve_marketing" size="sm" />
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -z-10 -top-4 -right-4 w-full h-full bg-primary/10 rounded-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built for brands and venues
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-card rounded-3xl p-8 shadow-md border border-border">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                <Store className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">For Brands</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-1">✓</span>
                  Put your products into an App Store–style catalog
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-1">✓</span>
                  Match with venues that actually fit your vibe
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-1">✓</span>
                  Pitch collabs in a few clicks, not 50 cold DMs
                </li>
              </ul>
            </div>
            <div className="bg-card rounded-3xl p-8 shadow-md border border-border">
              <div className="w-14 h-14 bg-secondary rounded-2xl flex items-center justify-center mb-6">
                <Coffee className="w-7 h-7 text-secondary-foreground" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">For Venues & Hosts</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="text-secondary-foreground mt-1">✓</span>
                  Discover local brands to activate your space
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-secondary-foreground mt-1">✓</span>
                  Browse their product catalog and hand-pick items
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-secondary-foreground mt-1">✓</span>
                  Run collab events, pop-ups, and cup sleeve campaigns
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Collaboration Types */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Four ways to collaborate from day one
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start simple. Growbro Collab Hub supports four key collab formats out of the box.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card rounded-2xl p-6 border border-border hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-bold text-foreground mb-2">Consignment</h3>
              <p className="text-sm text-muted-foreground">
                Place brand products in your space on a consignment basis and bring new stories onto your shelves.
              </p>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="font-bold text-foreground mb-2">Events</h3>
              <p className="text-sm text-muted-foreground">
                Co-host runs, workshops, pop-ups, or launches that bring real people into your space.
              </p>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mb-4">
                <Handshake className="w-6 h-6 text-secondary-foreground" />
              </div>
              <h3 className="font-bold text-foreground mb-2">Collab Product</h3>
              <p className="text-sm text-muted-foreground">
                Design limited collab drops together — from tees and socks to custom drinks.
              </p>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-4">
                <Coffee className="w-6 h-6 text-yellow-800" />
              </div>
              <h3 className="font-bold text-foreground mb-2">Cup Sleeve Marketing</h3>
              <p className="text-sm text-muted-foreground">
                Turn every cup into a billboard with seasonal sleeve designs, QR codes, and partner campaigns.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* App Store for Products */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
                An "app store" for your products
              </h2>
              <p className="text-lg text-muted-foreground">
                Brands can create a product catalog inside Growbro — think of it like an app store, but for physical products. Venues can browse, filter, and pick the items they'd love to feature.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-primary text-sm">✓</span>
                  </div>
                  <span className="text-muted-foreground">Add product photos, descriptions, and collab options</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-primary text-sm">✓</span>
                  </div>
                  <span className="text-muted-foreground">Tag products by category and collab type</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-primary text-sm">✓</span>
                  </div>
                  <span className="text-muted-foreground">Venues can select products directly inside a collab request</span>
                </li>
              </ul>
            </div>
            
            {/* Product Grid Mock */}
            <div className="bg-card rounded-3xl p-6 shadow-xl border border-border">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Store className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Urban Streetwear Co.</p>
                  <p className="text-sm text-muted-foreground">12 products</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-muted rounded-xl p-3">
                    <div className="aspect-square bg-background rounded-lg mb-2 flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">Product {i}</p>
                    <p className="text-xs text-muted-foreground">Apparel</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How Growbro Collab Hub works
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <UserPlus className="w-8 h-8 text-primary" />
              </div>
              <div className="text-sm font-medium text-primary mb-2">Step 1</div>
              <h3 className="text-xl font-bold text-foreground mb-3">Create your profile</h3>
              <p className="text-muted-foreground">
                Sign up as a brand or venue, tell us who you are, where you are, and what kind of collabs you're open to.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Search className="w-8 h-8 text-secondary-foreground" />
              </div>
              <div className="text-sm font-medium text-secondary-foreground mb-2">Step 2</div>
              <h3 className="text-xl font-bold text-foreground mb-3">Match & browse</h3>
              <p className="text-muted-foreground">
                Swipe through potential partners, filter by collab type, and explore profiles that match your vibe.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Send className="w-8 h-8 text-accent-foreground" />
              </div>
              <div className="text-sm font-medium text-accent-foreground mb-2">Step 3</div>
              <h3 className="text-xl font-bold text-foreground mb-3">Send a collab request</h3>
              <p className="text-muted-foreground">
                Pick a collab type, select products (for brands), add your notes, and start a chat to bring the idea to life.
              </p>
            </div>
          </div>
          <p className="text-center text-muted-foreground mt-12 max-w-xl mx-auto">
            Everything happens in one place — no messy spreadsheets, no scattered DMs.
          </p>
        </div>
      </section>

      {/* Made for Local Scenes */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Perfect for coffee shops, studios, galleries, and local brands
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Growbro Collab Hub is designed for real-world collabs — from neighbourhood cafés and indie stores to lifestyle brands, running clubs, and creators.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {['Coffee shops', 'Lifestyle & apparel brands', 'Studios & galleries', 'Running clubs & communities', 'Event spaces', 'Pop-up hosts'].map((tag) => (
              <span 
                key={tag} 
                className="px-4 py-2 bg-card border border-border rounded-full text-sm font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Frequently asked questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="bg-card border border-border rounded-2xl px-6">
              <AccordionTrigger className="text-left font-semibold">
                Is Growbro Collab Hub free to start?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Yes. You can create a profile, list products, and explore matches for free in the early phase.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="bg-card border border-border rounded-2xl px-6">
              <AccordionTrigger className="text-left font-semibold">
                Who should sign up as a brand vs. a venue?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                If you sell products or services and want more exposure, sign up as a brand. If you have a physical space or host events, sign up as a venue.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="bg-card border border-border rounded-2xl px-6">
              <AccordionTrigger className="text-left font-semibold">
                What types of collaborations can I run?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                The platform supports consignment, events, collab products, and cup sleeve marketing — with more formats coming later.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4" className="bg-card border border-border rounded-2xl px-6">
              <AccordionTrigger className="text-left font-semibold">
                Can I message partners inside the platform?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Yes. Once there's a match or a collab request, you can chat directly inside Growbro Collab Hub.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5" className="bg-card border border-border rounded-2xl px-6">
              <AccordionTrigger className="text-left font-semibold">
                Do you handle payments or contracts?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                For this MVP, Growbro focuses on discovery, matching, and communication. Payments and contracts stay between partners.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-primary/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Ready to find your next collab?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Turn your space or brand into a collab magnet — and meet partners who actually fit your vibe.
          </p>
          <Link to="/auth">
            <Button size="xl" variant="hero">
              Start matching now
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
                <Handshake className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">Growbro Collab Hub</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Built by Growbro to make collaboration easier in the real world.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <Instagram className="w-4 h-4" />
                Instagram
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
