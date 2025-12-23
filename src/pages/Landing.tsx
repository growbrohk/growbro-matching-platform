import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  motion,
  useMotionValue,
  useSpring,
  AnimatePresence,
  useInView,
} from "framer-motion";
import { useRef, useState, useEffect } from "react";
import {
  Database,
  CreditCard,
  ShoppingCart,
  Calendar,
  Handshake,
  TrendingUp,
  Sparkles,
  Zap,
  Globe,
  Package,
  Rocket,
  BarChart3,
  LucideIcon,
} from "lucide-react";

type BentoCard = {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  tone: "green" | "beige";
  rowSpan: string; // use responsive spans: "lg:row-span-2"
  colSpan: string; // use responsive spans: "lg:col-span-2"
};

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

export default function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse follower glow (desktop only via CSS hidden; still safe to compute)
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 25, stiffness: 200 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  // Track mouse position relative to container (only when pointer moves inside)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const bentoCards: BentoCard[] = [
    {
      id: 1,
      title: "One Backend",
      subtitle: "Unified Inventory",
      description: "Single source of truth. No data migration. No double stocking.",
      icon: Database,
      tone: "green",
      rowSpan: "lg:row-span-2",
      colSpan: "lg:col-span-1",
    },
    {
      id: 2,
      title: "Affordable POS",
      subtitle: "In-store sales",
      description: "Fast checkout, receipts, and daily sales — built for small teams.",
      icon: CreditCard,
      tone: "beige",
      rowSpan: "lg:row-span-1",
      colSpan: "lg:col-span-1",
    },
    {
      id: 3,
      title: "Online Shop",
      subtitle: "E-commerce ready",
      description: "Your storefront uses the same catalog & stock as your POS.",
      icon: ShoppingCart,
      tone: "beige",
      rowSpan: "lg:row-span-1",
      colSpan: "lg:col-span-1",
    },
    {
      id: 4,
      title: "Events & Bookings",
      subtitle: "Ticketing + check-in",
      description: "Create events, manage capacity, and check in with QR.",
      icon: Calendar,
      tone: "beige",
      rowSpan: "lg:row-span-1",
      colSpan: "lg:col-span-1",
    },
    {
      id: 5,
      title: "Collab Partners",
      subtitle: "Brands ↔ venues",
      description: "Find partners to boost online traffic or bring people offline — in one place.",
      icon: Handshake,
      tone: "green",
      rowSpan: "lg:row-span-1",
      colSpan: "lg:col-span-2",
    },
    {
      id: 6,
      title: "Growth Tools",
      subtitle: "Promotions + insights",
      description: "Simple campaigns + analytics so you can iterate and grow.",
      icon: TrendingUp,
      tone: "beige",
      rowSpan: "lg:row-span-1",
      colSpan: "lg:col-span-1",
    },
  ];

  // Decorative icons (desktop only with hidden lg:block)
  const floatingIcons = [
    { Icon: Sparkles, delay: 0, left: "8%", top: "18%" },
    { Icon: Zap, delay: 0.2, left: "88%", top: "20%" },
    { Icon: Globe, delay: 0.4, left: "12%", top: "72%" },
    { Icon: Package, delay: 0.6, left: "84%", top: "70%" },
    { Icon: Rocket, delay: 0.8, left: "4%", top: "48%" },
    { Icon: BarChart3, delay: 1, left: "92%", top: "54%" },
  ];

  return (
    <div
      ref={containerRef}
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: BRAND.beigeSoft, color: BRAND.dark }}
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(14,122,58,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(14,122,58,0.08) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, #000 60%, transparent 110%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, #000 60%, transparent 110%)",
        }}
      />

      {/* Warm vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(244,239,233,0.85) 55%, rgba(251,248,244,1) 100%)",
        }}
      />

      {/* Mouse follower glow (DESKTOP ONLY) */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-0 hidden lg:block"
        style={{
          background: `radial-gradient(520px circle at ${x}px ${y}px, rgba(14,122,58,0.18), transparent 45%)`,
        }}
      />

      {/* Floating decorative icons (DESKTOP ONLY) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden hidden lg:block">
        {floatingIcons.map(({ Icon, delay, left, top }) => (
          <motion.div
            key={`${Icon.name}-${left}-${top}`}
            className="absolute"
            style={{ left, top }}
            animate={{ y: [0, -14, 0], rotate: [0, 3, -3, 0] }}
            transition={{
              duration: 4 + delay,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }}
          >
            <Icon
              className="w-8 h-8"
              style={{ color: "rgba(14,122,58,0.22)" }}
            />
          </motion.div>
        ))}
      </div>

      {/* Navigation */}
      <nav className="relative z-50 sticky top-0 backdrop-blur-xl border-b"
        style={{
          backgroundColor: "rgba(251,248,244,0.82)",
          borderColor: "rgba(14,122,58,0.12)",
        }}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
                style={{ backgroundColor: BRAND.green }}
              >
                <Handshake className="w-5 h-5 text-white" />
              </div>
              <span
                className="font-bold text-lg tracking-tight"
                style={{ fontFamily: "'Inter Tight', sans-serif" }}
              >
                Growbro
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/auth">
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-black/5"
                  style={{ color: "rgba(15,31,23,0.78)" }}
                >
                  Log in
                </Button>
              </Link>
              <Link to="/auth">
                <Button
                  size="sm"
                  className="font-semibold"
                  style={{
                    backgroundColor: BRAND.green,
                    color: "white",
                  }}
                >
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 sm:pt-20 lg:pt-28 pb-10 sm:pb-14 lg:pb-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
              style={{
                borderColor: "rgba(14,122,58,0.18)",
                backgroundColor: "rgba(244,239,233,0.55)",
                color: "rgba(15,31,23,0.75)",
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: BRAND.green }} />
              <span>POS + Shop + Events + Collabs — one backend</span>
            </motion.div>

            <motion.h1
              className="mt-6 font-extrabold tracking-tight"
              style={{ fontFamily: "'Inter Tight', sans-serif", color: BRAND.dark }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.75,
                delay: 0.1,
                ease: [0.34, 1.56, 0.64, 1],
              }}
            >
              <span className="block text-4xl sm:text-5xl lg:text-7xl xl:text-8xl leading-[1.05]">
                Run your offline + online business{" "}
                <span style={{ color: BRAND.green }}>in one system</span>.
              </span>
            </motion.h1>

            <motion.p
              className="mt-5 text-base sm:text-lg lg:text-xl leading-relaxed max-w-3xl mx-auto"
              style={{ color: "rgba(15,31,23,0.72)" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.25 }}
            >
              No data migration. No double (or triple) stocking. Growbro unifies{" "}
              <span className="font-semibold" style={{ color: BRAND.dark }}>
                POS
              </span>
              ,{" "}
              <span className="font-semibold" style={{ color: BRAND.dark }}>
                online shop
              </span>
              ,{" "}
              <span className="font-semibold" style={{ color: BRAND.dark }}>
                inventory
              </span>
              ,{" "}
              <span className="font-semibold" style={{ color: BRAND.dark }}>
                events
              </span>
              , and a{" "}
              <span className="font-semibold" style={{ color: BRAND.dark }}>
                collab partner network
              </span>{" "}
              so brands and venues can boost each other’s traffic.
            </motion.p>

            <motion.div
              className="mt-7 sm:mt-8 flex flex-col sm:flex-row gap-3 justify-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.38 }}
            >
              <Link to="/auth" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto font-bold px-7 py-6 h-auto"
                  style={{
                    backgroundColor: BRAND.green,
                    color: "white",
                  }}
                >
                  Get Started — It’s Free
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
            </motion.div>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["One backend", "Unified inventory", "POS + Online shop", "Events + bookings", "Collab partners"].map(
                (t) => (
                  <span
                    key={t}
                    className="text-xs sm:text-sm rounded-full border px-3 py-1"
                    style={{
                      borderColor: "rgba(14,122,58,0.15)",
                      backgroundColor: "rgba(244,239,233,0.55)",
                      color: "rgba(15,31,23,0.7)",
                    }}
                  >
                    {t}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid */}
      <section id="modules" className="relative z-10 pb-16 sm:pb-20 lg:pb-28">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
          <BentoGrid cards={bentoCards} />
        </div>
      </section>

      {/* Footer */}
      <footer
        className="relative z-10 py-10 border-t"
        style={{ borderColor: "rgba(14,122,58,0.12)" }}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
                style={{ backgroundColor: BRAND.green }}
              >
                <Handshake className="w-5 h-5 text-white" />
              </div>
              <span
                className="font-bold"
                style={{ fontFamily: "'Inter Tight', sans-serif" }}
              >
                Growbro
              </span>
            </div>

            <p className="text-sm text-center" style={{ color: "rgba(15,31,23,0.6)" }}>
              Built for small businesses. One backend. No complexity.
            </p>

            <div className="flex items-center gap-6">
              <a
                href="#"
                className="text-sm hover:opacity-100 transition-opacity"
                style={{ color: "rgba(15,31,23,0.6)" }}
              >
                Contact
              </a>
              <a
                href="#"
                className="text-sm hover:opacity-100 transition-opacity"
                style={{ color: "rgba(15,31,23,0.6)" }}
              >
                Privacy
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BentoGrid({ cards }: { cards: BentoCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6 lg:auto-rows-[170px]">
      <AnimatePresence>
        {cards.map((card, index) => (
          <BentoCard key={card.id} card={card} index={index} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function BentoCard({ card, index }: { card: BentoCard; index: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const Icon = card.icon;

  const toneStyles =
    card.tone === "green"
      ? {
          borderColor: "rgba(14,122,58,0.18)",
          background:
            "linear-gradient(135deg, rgba(14,122,58,0.14), rgba(14,122,58,0.05))",
        }
      : {
          borderColor: "rgba(14,122,58,0.12)",
          background:
            "linear-gradient(135deg, rgba(244,239,233,0.85), rgba(251,248,244,0.95))",
        };

  return (
    <motion.div
      ref={ref}
      className={[
        "group relative overflow-hidden rounded-3xl border p-6 sm:p-7 cursor-pointer",
        "shadow-[0_18px_60px_rgba(15,31,23,0.08)]",
        card.rowSpan,
        card.colSpan,
      ].join(" ")}
      style={toneStyles}
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{
        duration: 0.55,
        delay: index * 0.08,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      whileHover={{
        scale: 1.02,
        transition: { type: "spring", stiffness: 300, damping: 20 },
      }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="relative z-10 h-full flex flex-col">
        <div className="mb-5">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-colors"
            style={{
              backgroundColor:
                card.tone === "green"
                  ? "rgba(14,122,58,0.12)"
                  : "rgba(14,122,58,0.08)",
            }}
          >
            <Icon className="w-6 h-6" style={{ color: BRAND.green }} />
          </div>

          <h3 className="text-xl sm:text-2xl font-bold" style={{ color: BRAND.dark }}>
            {card.title}
          </h3>
          <p className="text-sm font-medium mt-1" style={{ color: "rgba(15,31,23,0.62)" }}>
            {card.subtitle}
          </p>
        </div>

        <p className="text-sm leading-relaxed mt-auto" style={{ color: "rgba(15,31,23,0.7)" }}>
          {card.description}
        </p>
      </div>

      {/* Subtle hover sheen */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.0), rgba(255,255,255,0.22))",
        }}
      />
    </motion.div>
  );
}
