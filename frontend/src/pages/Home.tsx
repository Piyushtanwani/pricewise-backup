import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { Search, TrendingDown, TrendingUp, Zap, BarChart2, Bell, Sparkles, ChevronRight, ArrowRight } from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts"
import { products as initialProducts, priceHistoryData, categories } from "../data/mockData"
import { getProducts, type Product } from "../services/api"
import ProductCard from "../components/ui/ProductCard"
import Footer from "../components/layout/Footer"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const features = [
  {
    icon: BarChart2,
    title: "Compare Prices",
    desc: "See prices from multiple stores in one place. Always know you're getting the best deal.",
    color: "from-indigo-500 to-blue-500",
    bg: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  {
    icon: Bell,
    title: "Track Prices",
    desc: "Monitor products and get notified the moment prices drop to your target.",
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
    desc: "Find products and alternatives perfectly suited to your needs and budget.",
    color: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
]

const popular = ["iPhone 16", "MacBook Air", "Sony Headphones", "Gaming Laptops", "Smart TVs"]

export default function Home() {
  const [query, setQuery] = useState("")
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const navigate = useNavigate()

  useEffect(() => {
    getProducts({ limit: 12 }).then(({ items }) => {
      if (items && items.length > 0) {
        setProducts(items)
      }
    })
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

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
                <Zap size={13} className="text-indigo-400" />
                AI-Powered Shopping Intelligence
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5">
                Shop smarter.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">
                  Know the right price.
                </span>
              </h1>

              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl">
                Compare products, track prices, predict future trends, and discover better alternatives — all in one place.
              </p>

              <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-xl">
                  <Search size={18} className="text-slate-400 shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for a product, brand or category..."
                    className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                  />
                  <span className="text-xs text-slate-300 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono hidden sm:block">⌘K</span>
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap"
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
                    className="text-xs text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1 rounded-full transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero Widget */}
            <div className="hidden lg:block">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={products[0].image}
                    alt={products[0].name}
                    className="w-14 h-14 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-indigo-400 font-semibold">{products[0].brand}</p>
                    <p className="text-sm font-medium text-white truncate">{products[0].name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-lg font-bold text-white">{fmt(products[0].bestPrice)}</span>
                      <span className="text-xs text-slate-400 line-through">{fmt(products[0].mrp)}</span>
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 rounded-full">
                        -{products[0].discount}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <ResponsiveContainer width="100%" height={112}>
                    <AreaChart data={priceHistoryData}>
                      <defs>
                        <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
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
                    <p className="text-sm font-bold text-white">₹29,999</p>
                  </div>
                  <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-2 text-center">
                    <p className="text-xs text-emerald-400">Savings</p>
                    <p className="text-sm font-bold text-emerald-400">₹4,991</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-slate-400">Stores</p>
                    <p className="text-sm font-bold text-white">4</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 rounded-lg px-3 py-2">
                  <Sparkles size={13} className="text-indigo-400" />
                  <p className="text-xs text-indigo-300 font-medium">Good time to buy — price is 14% below average</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1440px] mx-auto px-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 mb-12">
          {[
            { label: "Products Tracked", value: "2.4M+", icon: BarChart2, color: "text-indigo-600" },
            { label: "Stores Covered", value: "50+", icon: TrendingDown, color: "text-emerald-600" },
            { label: "Price Alerts Sent", value: "180K+", icon: Bell, color: "text-amber-600" },
            { label: "Savings Discovered", value: "₹4.2Cr+", icon: Zap, color: "text-violet-600" },
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

        {/* Categories */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-slate-900">Explore Categories</h2>
            <button
              onClick={() => navigate("/discover")}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              All categories <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
            {categories.map(({ name, icon, count }) => (
              <button
                key={name}
                onClick={() => navigate(`/search?q=${name}`)}
                className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col items-center gap-1.5 hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-700">{name}</span>
                <span className="text-xs text-slate-400 font-mono">{count.toLocaleString("en-IN")}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Trending Products */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-slate-900">Trending Products</h2>
            <button
              onClick={() => navigate("/search?q=trending")}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>

        {/* Best Deals */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-slate-900">Best Deals Right Now</h2>
            <button
              onClick={() => navigate("/search?q=deals")}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              All deals <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.filter((p) => p.discount >= 10).map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/product/${p.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
              >
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-20 h-20 rounded-lg object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-indigo-600 mb-0.5">{p.brand}</p>
                  <p className="text-sm font-medium text-slate-800 line-clamp-2 mb-2">{p.name}</p>
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
                  Historical price charts, trend analysis, future price predictions with confidence intervals — all powered by machine learning trained on millions of price points.
                </p>
                <button
                  onClick={() => navigate("/price-intelligence")}
                  className="bg-white text-indigo-900 hover:bg-indigo-50 font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
                >
                  Explore Price Intelligence <ArrowRight size={16} />
                </button>
              </div>
              <div>
                <ResponsiveContainer width="100%" height={192}>
                  <AreaChart data={priceHistoryData}>
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
