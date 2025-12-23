import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, AnimatePresence, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import {
  Store,
  ShoppingCart,
  Calendar,
  Users,
  Database,
  TrendingUp,
  Sparkles,
  Zap,
  Globe,
  Package,
  CreditCard,
  BarChart3,
  Handshake,
  Rocket,
  LucideIcon,
} from "lucide-react";

type BentoCard = {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  color: string;
  borderColor: string;
  rowSpan: string;
  colSpan: string;
};

export default function Landing() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 25, stiffness: 200 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMousePosition({ x, y });
        mouseX.set(x);
        mouseY.set(y);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
      return () => container.removeEventListener("mousemove", handleMouseMove);
    }
  }, [mouseX, mouseY]);

  const bentoCards: BentoCard[] = [
    {
      id: 1,
      title: "One Backend",
      subtitle: "Unified Inventory",
      description: "Single source of truth. No data migration. No double stocking.",
      icon: Database,
      color: "from-[#CCFF00]/20 to-[#CCFF00]/5",
      borderColor: "border-[#CCFF00]/30",
      rowSpan: "row-span-2",
      colSpan: "col-span-1",
    },
    {
      id: 2,
      title: "POS System",
      subtitle: "In-Store Sales",
      description: "Complete point-of-sale solution for your physical location.",
      icon: CreditCard,
      color: "from-purple-500/20 to-purple-500/5",
      borderColor: "border-purple-500/30",
      rowSpan: "row-span-1",
      colSpan: "col-span-1",
    },
    {
      id: 3,
      title: "Online Shop",
      subtitle: "E-Commerce Ready",
      description: "Beautiful online storefront that syncs with your inventory instantly.",
      icon: ShoppingCart,
      color: "from-blue-500/20 to-blue-500/5",
      borderColor: "border-blue-500/30",
      rowSpan: "row-span-1",
      colSpan: "col-span-1",
    },
    {
      id: 4,
      title: "Events & Bookings",
      subtitle: "Ticketing System",
      description: "Sell tickets, manage capacity, track attendance. All integrated.",
      icon: Calendar,
      color: "from-pink-500/20 to-pink-500/5",
      borderColor: "border-pink-500/30",
      rowSpan: "row-span-1",
      colSpan: "col-span-1",
    },
    {
      id: 5,
      title: "Collab Partners",
      subtitle: "Network Effects",
      description: "Connect with brands and venues. Cross-promote. Grow together.",
      icon: Handshake,
      color: "from-orange-500/20 to-orange-500/5",
      borderColor: "border-orange-500/30",
      rowSpan: "row-span-1",
      colSpan: "col-span-2",
    },
    {
      id: 6,
      title: "Promotions & Growth",
      subtitle: "Marketing Tools",
      description: "Built-in campaigns, analytics, and growth features for small businesses.",
      icon: TrendingUp,
      color: "from-green-500/20 to-green-500/5",
      borderColor: "border-green-500/30",
      rowSpan: "row-span-1",
      colSpan: "col-span-1",
    },
  ];

  const floatingIcons = [
    { Icon: Sparkles, delay: 0, x: "10%", y: "15%" },
    { Icon: Zap, delay: 0.2, x: "85%", y: "20%" },
    { Icon: Globe, delay: 0.4, x: "15%", y: "75%" },
    { Icon: Package, delay: 0.6, x: "80%", y: "70%" },
    { Icon: Rocket, delay: 0.8, x: "5%", y: "50%" },
    { Icon: BarChart3, delay: 1, x: "90%", y: "55%" },
  ];

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden"
    >
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0a0a0a_100%)] pointer-events-none" />

      {/* Mouse Follower Glow */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(600px circle at ${x}px ${y}px, rgba(204,255,0,0.15), transparent 40%)`,
        }}
      />

      {/* Floating Decorative Icons */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {floatingIcons.map(({ Icon, delay, x, y }) => (
          <motion.div
            key={Icon.name}
            className="absolute"
            style={{ left: x, top: y }}
            animate={{
              y: [0, -20, 0],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 4 + delay,
              repeat: Infinity,
              ease: "easeInOut",
              delay: delay,
            }}
          >
            <Icon className="w-8 h-8 text-[#CCFF00]/20" />
          </motion.div>
        ))}
      </div>

      {/* Navigation */}
      <nav className="relative z-50 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#CCFF00] rounded-xl flex items-center justify-center">
                <Handshake className="w-5 h-5 text-[#0a0a0a]" />
              </div>
              <span className="font-bold text-lg">Growbro</span>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/auth">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  Log in
                </Button>
              </Link>
              <Link to="/auth">
                <Button
                  size="sm"
                  className="bg-[#CCFF00] text-[#0a0a0a] hover:bg-[#CCFF00]/90 font-semibold"
                >
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-20 lg:pt-40 lg:pb-32">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center space-y-8"
          >
            <motion.h1
              className="text-6xl sm:text-7xl lg:text-8xl xl:text-9xl font-extrabold leading-[0.9] tracking-tight"
              style={{ fontFamily: "'Inter Tight', sans-serif" }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            >
              All-in-one online
              <br />
              <span className="text-[#CCFF00]">↔ offline</span>
              <br />
              collaboration platform
            </motion.h1>

            <motion.p
              className="text-xl sm:text-2xl lg:text-3xl text-white/70 max-w-4xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              POS + Online Shop + Inventory + Events + Collabs
              <br />
              <span className="text-white/50 text-lg sm:text-xl lg:text-2xl">
                Single backend, unified inventory. Affordable for small businesses.
              </span>
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center pt-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <Link to="/auth">
                <Button
                  size="lg"
                  className="bg-[#CCFF00] text-[#0a0a0a] hover:bg-[#CCFF00]/90 font-bold text-lg px-8 py-6 h-auto"
                >
                  Get Started — It's Free
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid */}
      <section className="relative z-10 pb-32">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <BentoGrid cards={bentoCards} />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 border-t border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#CCFF00] rounded-xl flex items-center justify-center">
                <Handshake className="w-5 h-5 text-[#0a0a0a]" />
              </div>
              <span className="font-bold">Growbro</span>
            </div>
            <p className="text-sm text-white/50 text-center">
              Built for small businesses. One backend. No complexity.
            </p>
            <div className="flex items-center gap-6">
              <a
                href="#"
                className="text-sm text-white/50 hover:text-white transition-colors"
              >
                Contact
              </a>
              <a
                href="#"
                className="text-sm text-white/50 hover:text-white transition-colors"
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <AnimatePresence>
        {cards.map((card, index) => (
          <BentoCard key={card.id} card={card} index={index} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function BentoCard({
  card,
  index,
}: {
  card: BentoCard;
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const Icon = card.icon;

  return (
    <motion.div
      ref={ref}
      className={`${card.rowSpan} ${card.colSpan} group relative overflow-hidden rounded-3xl border ${card.borderColor} bg-gradient-to-br ${card.color} backdrop-blur-sm p-8 cursor-pointer`}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={
        isInView
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: 50, scale: 0.9 }
      }
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      whileHover={{
        scale: 1.02,
        transition: {
          type: "spring",
          stiffness: 300,
          damping: 20,
        },
      }}
    >
      <div className="relative z-10 h-full flex flex-col">
        <div className="mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-4 group-hover:bg-white/20 transition-colors">
            <Icon className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">{card.title}</h3>
          <p className="text-sm text-white/60 font-medium">{card.subtitle}</p>
        </div>
        <p className="text-white/70 text-sm leading-relaxed mt-auto">
          {card.description}
        </p>
      </div>

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </motion.div>
  );
}
