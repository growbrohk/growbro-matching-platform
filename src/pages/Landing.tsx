import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useMemo, useRef } from "react";
import {
  ArrowRight,
  Check,
  CreditCard,
  Database,
  ShoppingCart,
  Calendar,
  Handshake,
  Package,
  Receipt,
  BarChart3,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
  deep: "#0B1510", // deep section background
};

const springHover = { type: "spring", stiffness: 300, damping: 20 };

const popIn = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 18 },
  },
  exit: { opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.15 } },
};

function cls(...s: Array<string | false | undefined>) {
  return s.filter(Boolean).join(" ");
}

function Section({
  children,
  className,
  id,
  bg,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  bg?: string;
}) {
  return (
    <section id={id} className={cls("relative", className)} style={bg ? { backgroundColor: bg } : undefined}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10">{children}</div>
    </section>
  );
}

function InViewPop({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-120px" });
  return (
    <div ref={ref} className={className}>
      <AnimatePresence>
        {inView && (
          <motion.div
            key="inview"
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={{ delay }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span
      className="rounded-full border px-3 py-1 text-xs sm:text-sm"
      style={{
        borderColor: "rgba(14,122,58,0.18)",
        backgroundColor: "rgba(244,239,233,0.65)",
        color: "rgba(15,31,23,0.78)",
      }}
    >
      {text}
    </span>
  );
}

function Card({
  title,
  desc,
  icon,
  bullets,
  tone = "light",
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  bullets?: string[];
  tone?: "light" | "deep";
}) {
  const isDeep = tone === "deep";
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={springHover}
      className="rounded-3xl border p-6 sm:p-7 shadow-[0_18px_60px_rgba(15,31,23,0.08)]"
      style={{
        borderColor: isDeep ? "rgba(244,239,233,0.14)" : "rgba(14,122,58,0.14)",
        backgroundColor: isDeep ? "rgba(255,255,255,0.03)" : "rgba(251,248,244,0.9)",
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="h-11 w-11 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor: isDeep ? "rgba(244,239,233,0.08)" : "rgba(14,122,58,0.08)",
            color: isDeep ? BRAND.beigeSoft : BRAND.green,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div
            className="text-lg sm:text-xl font-bold tracking-tight"
            style={{ color: isDeep ? BRAND.beigeSoft : BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}
          >
            {title}
          </div>
          <div
            className="mt-1 text-sm sm:text-base leading-relaxed"
            style={{ color: isDeep ? "rgba(244,239,233,0.72)" : "rgba(15,31,23,0.72)" }}
          >
            {desc}
          </div>

          {bullets?.length ? (
            <ul className="mt-4 space-y-2">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm" style={{ color: isDeep ? "rgba(244,239,233,0.75)" : "rgba(15,31,23,0.72)" }}>
                  <Check className="mt-[2px] h-4 w-4" style={{ color: isDeep ? BRAND.greenSoft : BRAND.green }} />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(14,122,58,0.14)", backgroundColor: "rgba(251,248,244,0.85)" }}>
      <div className="text-xs" style={{ color: "rgba(15,31,23,0.6)" }}>{label}</div>
      <div className="text-sm sm:text-base font-semibold" style={{ color: BRAND.dark }}>{value}</div>
    </div>
  );
}

export default function Landing() {
  const modules = useMemo(
    () => [
      {
        title: "POS that’s actually usable",
        desc: "Fast cart checkout, multiple payment methods, receipts — built for small teams.",
        icon: <CreditCard className="h-5 w-5" />,
        bullets: ["Cart-based checkout", "Cash / Card / FPS / PayMe / Octopus / WeChat / Alipay", "Receipt + export-ready history"],
      },
      {
        title: "Online shop that shares the same stock",
        desc: "One catalog. One inventory. Sell in-store and online without syncing.",
        icon: <ShoppingCart className="h-5 w-5" />,
        bullets: ["Product pages + variants", "Orders synced to backend", "Inventory auto-decrements from any channel"],
      },
      {
        title: "Inventory that doesn’t break your brain",
        desc: "Track stock, spot low inventory, keep everything consistent across sales channels.",
        icon: <Package className="h-5 w-5" />,
        bullets: ["Unified stock levels", "Simple adjustments", "Low-stock alerts (MVP)"],
      },
      {
        title: "Events + bookings (O2O money)",
        desc: "Create events, sell tickets, manage capacity, and check-in on-site via QR.",
        icon: <Calendar className="h-5 w-5" />,
        bullets: ["Ticket types + quotas", "Bookings list", "QR check-in flow"],
      },
      {
        title: "Collab partners built-in",
        desc: "Match brands ↔ venues. Propose collabs, manage deals, and chat in one place.",
        icon: <Handshake className="h-5 w-5" />,
        bullets: ["Discover partners", "Deal pipeline", "Chat threads per collab"],
      },
      {
        title: "Simple analytics + growth tools",
        desc: "Know what’s working. Run promos, track sales, and improve week by week.",
        icon: <BarChart3 className="h-5 w-5" />,
        bullets: ["Sales overview", "Top products", "Lightweight insights (MVP)"],
      },
    ],
    []
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.beigeSoft, color: BRAND.dark }}>
      {/* NAV */}
      <nav
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{
          borderColor: "rgba(14,122,58,0.12)",
          backgroundColor: "rgba(251,248,244,0.86)",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/growbro-logo.jpg" 
                alt="GrowBro Logo" 
                className="h-9 w-9 rounded-xl object-cover"
              />
              <div className="leading-none">
                <div className="font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                  Growbro
                </div>
                <div className="text-xs" style={{ color: "rgba(15,31,23,0.6)" }}>
                  Online ↔ Offline Collaboration
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <a
                href="#modules"
                className="hidden sm:inline text-sm hover:opacity-80"
                style={{ color: "rgba(15,31,23,0.75)" }}
              >
                Modules
              </a>
              <a
                href="#how"
                className="hidden sm:inline text-sm hover:opacity-80"
                style={{ color: "rgba(15,31,23,0.75)" }}
              >
                How it works
              </a>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="hover:bg-black/5" style={{ color: "rgba(15,31,23,0.78)" }}>
                  Log in
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="font-semibold" style={{ backgroundColor: BRAND.green, color: "white" }}>
                  Get started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO (Cash-style: big headline, minimal, lots of whitespace, proof strip) */}
      <Section className="pt-16 sm:pt-20 lg:pt-28 pb-10 sm:pb-14">
        {/* subtle grid / texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.55]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(14,122,58,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(14,122,58,0.07) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse 85% 60% at 50% 0%, #000 55%, transparent 120%)",
            WebkitMaskImage: "radial-gradient(ellipse 85% 60% at 50% 0%, #000 55%, transparent 120%)",
          }}
        />

        <InViewPop>
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
              style={{
                borderColor: "rgba(14,122,58,0.18)",
                backgroundColor: "rgba(244,239,233,0.65)",
                color: "rgba(15,31,23,0.75)",
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: BRAND.green }} />
              <span>One backend. One inventory. One place to grow.</span>
            </div>

            <h1
              className="mt-6 font-extrabold tracking-tight"
              style={{ fontFamily: "'Inter Tight', sans-serif" }}
            >
              <span className="block text-4xl sm:text-5xl lg:text-7xl xl:text-8xl leading-[1.05]">
                POS + Shop + Events + Collabs —
                <span className="block" style={{ color: BRAND.green }}>
                  built as one system.
                </span>
              </span>
            </h1>

            <p className="mt-5 text-base sm:text-lg lg:text-xl leading-relaxed max-w-3xl mx-auto"
              style={{ color: "rgba(15,31,23,0.72)" }}
            >
              Growbro is an all-in-one online-to-offline collaboration platform.
              No data migration. No double/triple stocking. Brands and venues can
              sell everywhere and find partners to boost traffic — from the same backend.
            </p>

            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto font-bold px-7 py-6 h-auto"
                  style={{ backgroundColor: BRAND.green, color: "white" }}
                >
                  Start free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>

              <a href="#modules" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto px-7 py-6 h-auto"
                  style={{
                    borderColor: "rgba(14,122,58,0.25)",
                    color: BRAND.dark,
                    backgroundColor: "rgba(251,248,244,0.65)",
                  }}
                >
                  See modules
                </Button>
              </a>
            </div>

            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Pill text="No migration later" />
              <Pill text="Unified inventory" />
              <Pill text="Offline + Online sales" />
              <Pill text="Built-in collab partners" />
              <Pill text="Affordable for SMB" />
            </div>
          </div>
        </InViewPop>

        {/* Proof strip / “turn out” block */}
        <InViewPop delay={0.08} className="mt-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MiniStat label="Problem we remove" value="Double / triple stocking" />
            <MiniStat label="System style" value="One backend for all modules" />
            <MiniStat label="Best for" value="Brands + venues (O2O)" />
          </div>
        </InViewPop>
      </Section>

      {/* DEEP HERO-2 (Cash-like: dark section for impact) */}
      <Section bg={BRAND.deep} className="py-14 sm:py-16 lg:py-20">
        <InViewPop>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
                style={{ borderColor: "rgba(244,239,233,0.16)", backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(244,239,233,0.78)" }}
              >
                <Zap className="h-4 w-4" style={{ color: BRAND.greenSoft }} />
                <span>Sell + manage + grow — without switching tools</span>
              </div>

              <h2 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight"
                style={{ fontFamily: "'Inter Tight', sans-serif", color: BRAND.beigeSoft }}
              >
                A single system that powers your day-to-day — and your next collab.
              </h2>

              <p className="mt-4 text-base sm:text-lg leading-relaxed"
                style={{ color: "rgba(244,239,233,0.72)" }}
              >
                Use Growbro as your base layer: inventory, POS, store, events, and collaborations all live together.
                No syncing between apps. No messy spreadsheets. No “we forgot to update stock”.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card
                  tone="deep"
                  title="One catalog"
                  desc="Products created once → used everywhere."
                  icon={<Database className="h-5 w-5" />}
                  bullets={["POS + Shop share the same items", "Variants supported (MVP ready)"]}
                />
                <Card
                  tone="deep"
                  title="One inventory"
                  desc="Stock stays consistent across channels."
                  icon={<Package className="h-5 w-5" />}
                  bullets={["Auto decrement", "Less human mistakes"]}
                />
              </div>
            </div>

            {/* “Visual” panel (no bento, cash-like big device panel) */}
            <div className="relative">
              <motion.div
                whileHover={{ y: -4 }}
                transition={springHover}
                className="rounded-[28px] border overflow-hidden"
                style={{
                  borderColor: "rgba(244,239,233,0.14)",
                  background:
                    "linear-gradient(135deg, rgba(14,122,58,0.18), rgba(255,255,255,0.03))",
                }}
              >
                <div className="p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold" style={{ color: "rgba(244,239,233,0.9)" }}>
                      Growbro Dashboard (preview)
                    </div>
                    <div className="text-xs" style={{ color: "rgba(244,239,233,0.6)" }}>
                      POS • Shop • Events • Collabs
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3">
                    <PanelRow
                      icon={<CreditCard className="h-4 w-4" />}
                      title="POS Checkout"
                      meta="Cart • Payment methods • Receipt"
                    />
                    <PanelRow
                      icon={<ShoppingCart className="h-4 w-4" />}
                      title="Online Orders"
                      meta="Same catalog • Same stock"
                    />
                    <PanelRow
                      icon={<Calendar className="h-4 w-4" />}
                      title="Event Booking"
                      meta="Tickets • Quotas • Check-in"
                    />
                    <PanelRow
                      icon={<Handshake className="h-4 w-4" />}
                      title="Collab Deals"
                      meta="Discover • Propose • Chat"
                    />
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {["No migration", "One backend", "O2O growth"].map((t) => (
                      <span
                        key={t}
                        className="text-xs rounded-full border px-3 py-1"
                        style={{
                          borderColor: "rgba(244,239,233,0.14)",
                          backgroundColor: "rgba(0,0,0,0.18)",
                          color: "rgba(244,239,233,0.78)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* subtle corner glow */}
              <div
                className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full blur-3xl opacity-50"
                style={{ backgroundColor: "rgba(14,122,58,0.35)" }}
              />
            </div>
          </div>
        </InViewPop>
      </Section>

      {/* MODULES (Cash-like: clean grid, lots of detail per module) */}
      <Section id="modules" className="py-14 sm:py-16 lg:py-20" bg={BRAND.beigeSoft}>
        <InViewPop>
          <div className="text-center">
            <div className="text-sm font-semibold" style={{ color: BRAND.green }}>
              Modules
            </div>
            <h2
              className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight"
              style={{ fontFamily: "'Inter Tight', sans-serif", color: BRAND.dark }}
            >
              Everything you need — built to work together.
            </h2>
            <p className="mt-4 max-w-3xl mx-auto text-base sm:text-lg leading-relaxed"
              style={{ color: "rgba(15,31,23,0.72)" }}
            >
              Each module is useful alone. Together, they remove the biggest headache: syncing between tools.
            </p>
          </div>
        </InViewPop>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {modules.map((m, i) => (
            <InViewPop key={m.title} delay={0.04 * i}>
              <Card title={m.title} desc={m.desc} icon={m.icon} bullets={m.bullets} />
            </InViewPop>
          ))}
        </div>

        {/* mini “trust” row */}
        <InViewPop delay={0.1} className="mt-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TrustItem
              icon={<ShieldCheck className="h-5 w-5" />}
              title="One backend, less risk"
              desc="Fewer moving parts = fewer mistakes."
            />
            <TrustItem
              icon={<Receipt className="h-5 w-5" />}
              title="Operations ready"
              desc="Sales history + receipts are built-in."
            />
            <TrustItem
              icon={<MessageCircle className="h-5 w-5" />}
              title="Collab-ready"
              desc="Propose deals and chat in the same system."
            />
          </div>
        </InViewPop>
      </Section>

      {/* HOW IT WORKS (Cash-like: simple steps, bold icons, easy scan) */}
      <Section id="how" className="py-14 sm:py-16 lg:py-20" bg={BRAND.beige}>
        <InViewPop>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-sm font-semibold" style={{ color: BRAND.green }}>
                How it works
              </div>
              <h2
                className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight"
                style={{ fontFamily: "'Inter Tight', sans-serif" }}
              >
                Set up once. Operate daily. Grow through collabs.
              </h2>
              <p className="mt-4 text-base sm:text-lg leading-relaxed" style={{ color: "rgba(15,31,23,0.72)" }}>
                Growbro is designed so your “day-to-day ops” and your “growth moves” live in the same place.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Pill text="Create products once" />
                <Pill text="Sell everywhere" />
                <Pill text="Partner to boost traffic" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Step
                num="01"
                title="Create your catalog"
                desc="Products, variants, pricing — used across POS + Shop."
                icon={<Database className="h-5 w-5" />}
              />
              <Step
                num="02"
                title="Sell in-store + online"
                desc="Sales update stock automatically. Orders are unified."
                icon={<CreditCard className="h-5 w-5" />}
              />
              <Step
                num="03"
                title="Launch events & collabs"
                desc="Ticketing, bookings, partner matching, and chat."
                icon={<Handshake className="h-5 w-5" />}
              />
            </div>
          </div>
        </InViewPop>
      </Section>

      {/* USE CASES (Cash-like: split blocks) */}
      <Section className="py-14 sm:py-16 lg:py-20" bg={BRAND.beigeSoft}>
        <InViewPop>
          <div className="text-center">
            <div className="text-sm font-semibold" style={{ color: BRAND.green }}>
              Use cases
            </div>
            <h2
              className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight"
              style={{ fontFamily: "'Inter Tight', sans-serif" }}
            >
              Built for brands, venues, and community-driven business.
            </h2>
          </div>
        </InViewPop>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          <InViewPop delay={0.02}>
            <UseCase
              title="Online brands → offline exposure"
              desc="Place products in venues, run pop-ups, and drive discovery in the real world."
              bullets={["Consignment-ready flows (future)", "Events + ticketing", "Partner discovery"]}
            />
          </InViewPop>
          <InViewPop delay={0.06}>
            <UseCase
              title="Cafés / venues → online traffic"
              desc="Turn your space into a marketing channel and partnership hub."
              bullets={["POS + store unify inventory", "Collab marketplace", "Repeatable events"]}
            />
          </InViewPop>
          <InViewPop delay={0.1}>
            <UseCase
              title="Community & recurring activations"
              desc="Run monthly collab events and keep participants engaged with one system."
              bullets={["Bookings + QR check-in", "Sales + merch in one place", "Chat + updates"]}
            />
          </InViewPop>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-14 sm:py-16 lg:py-20" bg={BRAND.beige}>
        <InViewPop>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
              <div className="text-sm font-semibold" style={{ color: BRAND.green }}>
                FAQ
              </div>
              <h2
                className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight"
                style={{ fontFamily: "'Inter Tight', sans-serif" }}
              >
                Quick answers.
              </h2>
              <p className="mt-4 text-base sm:text-lg leading-relaxed" style={{ color: "rgba(15,31,23,0.72)" }}>
                The whole point is: fewer tools, fewer mistakes, faster growth.
              </p>
            </div>

            <div className="space-y-3">
              <FAQ
                q="Do I need to migrate data later?"
                a="No — Growbro is built as one backend from day one. POS, store, events and collabs share the same data model."
              />
              <FAQ
                q="Will I have to manage two inventories?"
                a="No — inventory is unified. Selling online or in-store updates the same stock."
              />
              <FAQ
                q="Is this only for cafés?"
                a="No — it works for brands and venues. The collab network is what makes it O2O."
              />
              <FAQ
                q="Can we start simple?"
                a="Yes — start with POS + inventory, then add store/events/collabs as you grow."
              />
            </div>
          </div>
        </InViewPop>
      </Section>

      {/* FINAL CTA (Cash-like: bold close) */}
      <Section bg={BRAND.deep} className="py-14 sm:py-16 lg:py-20">
        <InViewPop>
          <div className="text-center">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
              style={{
                borderColor: "rgba(244,239,233,0.16)",
                backgroundColor: "rgba(255,255,255,0.03)",
                color: "rgba(244,239,233,0.78)",
              }}
            >
              <Database className="h-4 w-4" style={{ color: BRAND.greenSoft }} />
              <span>One backend for your whole business</span>
            </div>

            <h2
              className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight"
              style={{ fontFamily: "'Inter Tight', sans-serif", color: BRAND.beigeSoft }}
            >
              Ready to run everything in one system?
            </h2>

            <p className="mt-4 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed"
              style={{ color: "rgba(244,239,233,0.72)" }}
            >
              Start with POS + inventory. Add shop, events and collab partners when you’re ready.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto font-bold px-7 py-6 h-auto"
                  style={{ backgroundColor: BRAND.green, color: "white" }}
                >
                  Start free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>

              <a href="#modules" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto px-7 py-6 h-auto"
                  style={{
                    borderColor: "rgba(244,239,233,0.22)",
                    color: BRAND.beigeSoft,
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                >
                  Review modules
                </Button>
              </a>
            </div>
          </div>
        </InViewPop>

        <div className="mt-10 border-t" style={{ borderColor: "rgba(244,239,233,0.12)" }}>
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img 
                src="/growbro-logo.jpg" 
                alt="GrowBro Logo" 
                className="h-9 w-9 rounded-xl object-cover"
              />
              <div className="text-sm" style={{ color: "rgba(244,239,233,0.75)" }}>
                Growbro • Online ↔ Offline Collaboration
              </div>
            </div>
            <div className="text-xs" style={{ color: "rgba(244,239,233,0.55)" }}>
              © {new Date().getFullYear()} Growbro. Built for small businesses.
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function PanelRow({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-3 flex items-center justify-between gap-3"
      style={{
        borderColor: "rgba(244,239,233,0.14)",
        backgroundColor: "rgba(0,0,0,0.16)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(244,239,233,0.08)", color: BRAND.greenSoft }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "rgba(244,239,233,0.9)" }}>
            {title}
          </div>
          <div className="text-xs truncate" style={{ color: "rgba(244,239,233,0.6)" }}>
            {meta}
          </div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4" style={{ color: "rgba(244,239,233,0.55)" }} />
    </div>
  );
}

function TrustItem({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-3xl border p-6" style={{ borderColor: "rgba(14,122,58,0.14)", backgroundColor: "rgba(251,248,244,0.9)" }}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(14,122,58,0.08)", color: BRAND.green }}>
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: BRAND.dark }}>{title}</div>
          <div className="text-sm" style={{ color: "rgba(15,31,23,0.65)" }}>{desc}</div>
        </div>
      </div>
    </div>
  );
}

function Step({
  num,
  title,
  desc,
  icon,
}: {
  num: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={springHover}
      className="rounded-3xl border p-6"
      style={{
        borderColor: "rgba(14,122,58,0.14)",
        backgroundColor: "rgba(251,248,244,0.9)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold" style={{ color: BRAND.green }}>
            {num}
          </div>
          <div className="mt-1 text-lg font-bold tracking-tight" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
            {title}
          </div>
          <div className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(15,31,23,0.7)" }}>
            {desc}
          </div>
        </div>
        <div className="h-11 w-11 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(14,122,58,0.08)", color: BRAND.green }}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

function UseCase({
  title,
  desc,
  bullets,
}: {
  title: string;
  desc: string;
  bullets: string[];
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={springHover}
      className="rounded-3xl border p-6 sm:p-7 shadow-[0_18px_60px_rgba(15,31,23,0.08)]"
      style={{ borderColor: "rgba(14,122,58,0.14)", backgroundColor: "rgba(251,248,244,0.9)" }}
    >
      <div className="text-lg font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: BRAND.dark }}>
        {title}
      </div>
      <div className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(15,31,23,0.72)" }}>
        {desc}
      </div>
      <ul className="mt-4 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm" style={{ color: "rgba(15,31,23,0.7)" }}>
            <Check className="mt-[2px] h-4 w-4" style={{ color: BRAND.green }} />
            <span className="leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-3xl border p-6" style={{ borderColor: "rgba(14,122,58,0.14)", backgroundColor: "rgba(251,248,244,0.9)" }}>
      <div className="text-base font-semibold" style={{ color: BRAND.dark }}>
        {q}
      </div>
      <div className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(15,31,23,0.72)" }}>
        {a}
      </div>
    </div>
  );
}
