import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { Search, TrendingDown, Zap, BarChart2, Bell, Sparkles, ChevronRight, ArrowRight, Smartphone } from "lucide-react"
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts"
import ProductCard from "../components/ui/ProductCard"
import Footer from "../components/layout/Footer"
import { api } from "../services/api"
import type { Product, CatalogMeta } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const features = [
  {
    icon: BarChart2,
    title: "Compare Prices",
    desc: "See prices from Amazon, Flipkart, Croma & Smartprix in one place. Always get the best deal.",
    color: "from-indigo-500 to-blue-500",
    bg: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  {
    icon: Bell,
    title: "Track Prices",
    desc: "Monitor smartphones and get notified the moment prices drop to your target.",
    color: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    icon: TrendingDown,
    title: "Predict Prices",
    desc: "Use historical data and AI modeling to understand where prices are likely to go.",
    color: "from-violet-500 to-purple-500",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    icon: Sparkles,
    title: "AI Recommendations",
    desc: "Find phones and alternatives perfectly suited to your budget and desired specs.",
    color: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
]

const popular = ["iPhone 18", "Galaxy S26", "OnePlus 13", "Edge 70", "Find X10", "Vivo X200"]

export default function Home() {
  const [query, setQuery] = useState("")
  const [trending, setTrending] = useState<Product[]>([])
  const [deals, setDeals] = useState<Product[]>([])
  const [meta, setMeta] = useState<CatalogMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      try {
        setLoading(true)
        const [trendingRes, dealsRes, metaRes] = await Promise.all([
          api.getProducts({ sort: "relevance", limit: 8 }),
          api.getProducts({ sort: "best_deal", limit: 6 }),
          api.getCatalogMeta(),
        ])

        if (isMounted) {
          setTrending(trendingRes.items || [])
          setDeals(dealsRes.items || [])
          setMeta(metaRes)
        }
      } catch (err) {
        console.error("Failed to load home page products from API:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadData()
    return () => { isMounted = false }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  const heroProduct = deals[0] || trending[0]
  const heroSavings = heroProduct ? Math.max(0, heroProduct.mrp - heroProduct.bestPrice) : 0
  const heroChartData = heroProduct?.priceHistory?.length
    ? heroProduct.priceHistory.map((p, idx) => ({
        date: `Pt ${idx + 1}`,
        price: p,
        avg: heroProduct.bestPrice,
      }))
    : [
        { date: "Day 1", price: heroProduct ? Math.round(heroProduct.bestPrice * 1.08) : 29999, avg: heroProduct?.bestPrice || 29999 },
        { date: "Day 15", price: heroProduct ? Math.round(heroProduct.bestPrice * 1.04) : 28500, avg: heroProduct?.bestPrice || 29999 },
        { date: "Today", price: heroProduct?.bestPrice || 27999, avg: heroProduct?.bestPrice || 29999 },
      ]

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-16 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, #4f46e5 0%, transparent 50%), radial-gradient(circle at 80% 20%, #2563eb 0%, transparent 40%)",
          }}
        />
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at center, rgba(148,163,184,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />

        <div className="relative max-w-[1440px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5 text-sm text-blue-300 mb-6">
                <img src="/logo-mark.png" alt="PriceWise" className="w-4 h-4 object-contain select-none" />
                Live Supabase Mobile Catalog & Price Intelligence
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5">
                Shop smarter.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">
                  Know the right price.
                </span>
              </h1>

              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl">
                Compare {meta?.brands?.length || 7} top smartphone brands across Amazon, Flipkart, Croma, and Smartprix with real-time specs, price trends, and AI recommendations.
              </p>

              <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-xl">
                  <Search size={18} className="text-slate-400 shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for iPhone, Galaxy, OnePlus, Edge, Reno..."
                    className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                  />
                  <span className="text-xs text-slate-300 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono hidden sm:block">Enter</span>
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-lg shadow-indigo-600/30"
                >
                  Search <ArrowRight size={15} />
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-slate-500">Popular:</span>
                {popular.map((p) => (
                  <button
                    key={p}
                    onClick={() => navigate(`/search?q=${encodeURIComponent(p)}`)}
                    className="text-xs text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero Widget with Real Product */}
            <div className="hidden lg:block">
              {heroProduct && (
                <div
                  onClick={() => navigate(`/product/${heroProduct.id}`)}
                  className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 cursor-pointer hover:bg-white/15 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <img
                      src={heroProduct.image}
                      alt={heroProduct.name}
                      className="w-16 h-16 rounded-xl object-cover bg-white/20"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-indigo-400 font-semibold">{heroProduct.brand}</p>
                      <p className="text-sm font-medium text-white truncate group-hover:text-indigo-200 transition-colors">{heroProduct.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-lg font-bold text-white">{fmt(heroProduct.bestPrice)}</span>
                        <span className="text-xs text-slate-400 line-through">{fmt(heroProduct.mrp)}</span>
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 rounded-full">
                          -{heroProduct.discount}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <ResponsiveContainer width="100%" height={112}>
                      <AreaChart data={heroChartData}>
                        <defs>
                          <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#heroGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/10 rounded-lg p-2 text-center">
                      <p className="text-xs text-slate-400">Current</p>
                      <p className="text-sm font-bold text-white">{fmt(heroProduct.bestPrice)}</p>
                    </div>
                    <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-2 text-center">
                      <p className="text-xs text-emerald-400">Savings</p>
                      <p className="text-sm font-bold text-emerald-400">{fmt(heroSavings)}</p>
                    </div>
                    <div className="bg-white/10 rounded-lg p-2 text-center">
                      <p className="text-xs text-slate-400">Store</p>
                      <p className="text-sm font-bold text-white">{heroProduct.bestStore}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 rounded-lg px-3 py-2">
                    <Sparkles size={13} className="text-indigo-400" />
                    <p className="text-xs text-indigo-300 font-medium">
                      {heroProduct.aiVerdict} — {heroProduct.discount}% below estimated MRP
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1440px] mx-auto px-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 mb-12">
          {[
            { label: "Mobiles Tracked", value: `${meta?.categories?.[0]?.count || 140}+`, icon: Smartphone, color: "text-indigo-600" },
            { label: "Stores Covered", value: `${meta?.stores?.length || 4} Retailers`, icon: TrendingDown, color: "text-emerald-600" },
            { label: "Top Brands", value: `${meta?.brands?.length || 7} Brands`, icon: BarChart2, color: "text-amber-600" },
            { label: "Live Supabase DB", value: "Real-Time Sync", icon: Zap, color: "text-violet-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <Icon size={18} className={`${color} mb-1`} />
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Everything you need to buy smarter</h2>
          <p className="text-slate-500 mb-6">Four powerful tools in one intelligent platform</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map(({ icon: Icon, title, desc, bg, iconColor }) => (
              <div key={title} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon size={18} className={iconColor} />
                </div>
                <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Brand Showcase (Fetched from Supabase Meta) */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-slate-900">Explore Top Brands</h2>
            <button
              onClick={() => navigate("/discover")}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              All brands <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {meta?.brands?.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => navigate(`/search?brand=${encodeURIComponent(name)}`)}
                className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-1.5 hover:border-indigo-400 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  {name.charAt(0)}
                </div>
                <span className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600">{name}</span>
                <span className="text-xs text-slate-400 font-mono">{count} Models</span>
              </button>
            ))}
          </div>
        </section>

        {/* Trending Products */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-slate-900">Trending Smartphones</h2>
            <button
              onClick={() => navigate("/search?sort=relevance")}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              View all <ChevronRight size={14} />
            </button>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-80 bg-white rounded-xl border border-slate-200 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {trending.slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>

        {/* Best Deals */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-slate-900">Best Deals Right Now</h2>
            <button
              onClick={() => navigate("/search?sort=best_deal")}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              All deals <ChevronRight size={14} />
            </button>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deals.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/product/${p.id}`)}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-20 h-20 rounded-lg object-cover shrink-0 bg-slate-50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-indigo-600 mb-0.5">{p.brand}</p>
                    <p className="text-sm font-medium text-slate-800 line-clamp-2 mb-2 group-hover:text-indigo-600 transition-colors">{p.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">{fmt(p.bestPrice)}</span>
                      <span className="text-xs text-slate-400 line-through">{fmt(p.mrp)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">
                        -{p.discount}%
                      </span>
                      <span className="text-xs text-slate-500">at {p.bestStore}</span>
                      <TrendingDown size={11} className="ml-auto text-emerald-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Price Intelligence CTA */}
        <section className="mb-14">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-8 md:p-12">
            <div className="absolute inset-0 opacity-30" style={{
              backgroundImage: "radial-gradient(circle at 80% 20%, #6366f1, transparent 50%)",
            }} />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-indigo-400 text-sm font-semibold mb-2 uppercase tracking-wide">PriceWise Intelligence</p>
                <h2 className="text-3xl font-bold text-white mb-3">
                  AI that tells you exactly when to buy
                </h2>
                <p className="text-slate-400 leading-relaxed mb-6">
                  Historical price charts, retailer tracking (Amazon, Flipkart, Croma), and future price predictions — powered by real data and machine learning.
                </p>
                <button
                  onClick={() => navigate("/price-intelligence")}
                  className="bg-white text-indigo-900 hover:bg-indigo-50 font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  Explore Price Intelligence <ArrowRight size={16} />
                </button>
              </div>
              <div>
                <ResponsiveContainer width="100%" height={192}>
                  <AreaChart data={heroChartData}>
                    <defs>
                      <linearGradient id="piGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip
                      contentStyle={{ background: "#1e3a8a", border: "1px solid #3b82f6", borderRadius: 8, color: "white", fontSize: 12 }}
                      formatter={(v) => [typeof v === "number" ? fmt(v) : String(v), "Price"]}
                    />
                    <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#piGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="avg" stroke="#94a3b8" fill="none" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  )
}
