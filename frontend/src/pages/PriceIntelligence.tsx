import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router"
import {
  TrendingDown, TrendingUp, Sparkles, Info, Loader2, ArrowUpRight,
  ShieldCheck, AlertCircle, RefreshCw, BarChart3, Store as StoreIcon,
  Activity, CheckCircle2, Percent, ArrowDownRight, ExternalLink
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend
} from "recharts"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import type { MarketIntelligenceSummary, VerifiedPriceDrop } from "../types/product"

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

const resolveImageUrl = (imageUrl: string | null | undefined, brand?: string) => {
  if (imageUrl) {
    const spMatch = imageUrl.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/)
    if (spMatch) {
      return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-w420-h420/phone.webp`
    }
    return imageUrl
  }
  const b = (brand || "").toLowerCase()
  if (b.includes("apple")) return "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"
  if (b.includes("samsung")) return "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80"
  if (b.includes("oneplus")) return "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"
  if (b.includes("motorola")) return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
  if (b.includes("vivo")) return "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80"
  if (b.includes("realme")) return "https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80"
  if (b.includes("oppo")) return "https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80"
  if (b.includes("redmi") || b.includes("xiaomi")) return "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"
  if (b.includes("google") || b.includes("pixel")) return "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"
  return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
}

export default function PriceIntelligence() {
  const navigate = useNavigate()
  const [data, setData] = useState<MarketIntelligenceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dropSort, setDropSort] = useState<"savings" | "percent">("savings")

  const loadMarketData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const summary = await api.getMarketIntelligence(isRefresh)
      setData(summary)
    } catch (err: any) {
      console.error("Failed to load market intelligence:", err)
      setError(err?.response?.data?.message || "Failed to load market intelligence analytics. Please try again.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadMarketData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20 flex items-center justify-center">
        <div className="text-center max-w-md p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={40} />
          <h2 className="text-lg font-bold text-slate-800 mb-1">Analyzing Market Intelligence...</h2>
          <p className="text-sm text-slate-500">
            Calculating cohort price direction, verified drops, retailer competitiveness, and volatility indexes from database observations...
          </p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20 max-w-[1440px] mx-auto px-6">
        <div className="bg-white rounded-2xl border border-rose-200 p-10 max-w-xl mx-auto shadow-sm text-center">
          <AlertCircle className="text-rose-500 mx-auto mb-3" size={42} />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Unable to Load Market Intelligence</h2>
          <p className="text-sm text-slate-600 mb-6">{error || "No market observations were returned."}</p>
          <button
            onClick={() => loadMarketData(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            <RefreshCw size={15} />
            Retry Analytics
          </button>
        </div>
      </div>
    )
  }

  const { direction, topPriceDrops, retailerCompetitiveness, volatility, buyingOpportunities, metadata } = data

  const sortedDrops = [...topPriceDrops].sort((a, b) =>
    dropSort === "savings" ? b.absoluteChange - a.absoluteChange : b.percentageChange - a.percentageChange
  )

  const topRetailer = retailerCompetitiveness.length > 0 ? retailerCompetitiveness[0] : null
  const topDrop = topPriceDrops.length > 0 ? topPriceDrops[0] : null

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">

        {/* Hero Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 border border-indigo-200/80 text-indigo-700">
                <BarChart3 size={13} />
                Market-Wide Analytics
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                <ShieldCheck size={13} />
                {metadata.genuineProductsAnalyzed} Verified Phones Analyzed
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              Smartphone Market Intelligence
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Macro price movements, retailer competitiveness, verified price drops, and historical volatility across India's smartphone ecosystem.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400">Database Cohort Updated</p>
              <p className="text-xs font-mono font-medium text-slate-600">
                {new Date(direction.lastUpdated).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              onClick={() => loadMarketData(true)}
              disabled={refreshing}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl shadow-2xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin text-indigo-600" : "text-slate-500"} />
              {refreshing ? "Updating..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Data Provenance & Integrity Banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-800">Data Integrity Notice:</span>
            <span>
              All analytics computed strictly from real verified observations. {metadata.syntheticProductsExcluded} synthetic seed fixtures excluded from market calculations.
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <span>Catalogue Total: <strong className="text-slate-800 font-mono">{metadata.totalCatalogProducts}</strong></span>
            <span>Active Cohort: <strong className="text-slate-800 font-mono">{direction.cohortSize}</strong></span>
            <span>Tracked Retailers: <strong className="text-slate-800 font-mono">{retailerCompetitiveness.length}</strong></span>
          </div>
        </div>

        {/* KPI Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <p className="text-xs text-slate-500 mb-1">Market Direction (30d)</p>
            <div className="flex items-center gap-1.5">
              {direction.direction === "FALLING" ? (
                <>
                  <TrendingDown size={18} className="text-emerald-600" />
                  <span className="text-base font-bold text-emerald-700 font-mono">{direction.averageChangePercent}%</span>
                </>
              ) : direction.direction === "RISING" ? (
                <>
                  <TrendingUp size={18} className="text-rose-600" />
                  <span className="text-base font-bold text-rose-700 font-mono">+{direction.averageChangePercent}%</span>
                </>
              ) : (
                <>
                  <Activity size={18} className="text-slate-600" />
                  <span className="text-base font-bold text-slate-700 font-mono">Stable</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{direction.fallingCount} dropped / {direction.risingCount} rose</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <p className="text-xs text-slate-500 mb-1">Analyzed Cohort</p>
            <p className="text-base font-bold text-slate-900 font-mono">{direction.cohortSize} Phones</p>
            <p className="text-[11px] text-slate-400 mt-1">Continuous 30-day tracking</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <p className="text-xs text-slate-500 mb-1">Top Price Drop</p>
            <p className="text-base font-bold text-emerald-700 font-mono">
              {topDrop ? fmt(topDrop.absoluteChange) : "—"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {topDrop ? `${topDrop.brand} on ${topDrop.retailer}` : "No drops recorded"}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <p className="text-xs text-slate-500 mb-1">Most Competitive</p>
            <p className="text-base font-bold text-indigo-700 font-mono">
              {topRetailer ? topRetailer.storeName : "—"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {topRetailer ? `${topRetailer.winRatePercent}% lowest price wins` : "—"}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <p className="text-xs text-slate-500 mb-1">Buying Opportunities</p>
            <p className="text-base font-bold text-emerald-700 font-mono">{buyingOpportunities.length} Verified</p>
            <p className="text-[11px] text-slate-400 mt-1">Near lows or &gt;5% under avg</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <p className="text-xs text-slate-500 mb-1">Volatility Validated</p>
            <p className="text-base font-bold text-slate-900 font-mono">{volatility.qualifiedCount} Models</p>
            <p className="text-[11px] text-slate-400 mt-1">{volatility.insufficientHistoryCount} thin history</p>
          </div>
        </div>

        {/* SECTION 1: Market Price Direction & Cohort Trend */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-slate-900">1. Market Price Direction & 30-Day Cohort Index</h2>
                <Badge variant={direction.direction === "FALLING" ? "success" : direction.direction === "RISING" ? "error" : "neutral"}>
                  {direction.direction} (Mean: {direction.averageChangePercent}%, Median: {direction.medianChangePercent}%)
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Continuous fixed-cohort benchmark price index tracked across {direction.cohortSize} genuine smartphones in India.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg inline-block">
                Sample Size: {direction.cohortSize} models
              </span>
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-6 items-center mb-4">
            {/* Chart */}
            <div className="lg:col-span-3">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={direction.trendSeries}>
                  <defs>
                    <linearGradient id="marketTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    width={45}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    formatter={(val, name) => [typeof val === "number" ? fmt(val) : String(val), name === "avgPrice" ? "Balanced Cohort Average" : String(name)]}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgPrice"
                    name="Balanced Cohort Average"
                    stroke="#4f46e5"
                    fill="url(#marketTrendGrad)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Direction Breakdown Summary */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Cohort Dynamics</h3>
                <div className="space-y-3 mb-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-emerald-700 flex items-center gap-1">
                        <TrendingDown size={13} /> Dropped in Price
                      </span>
                      <span className="font-mono font-bold text-slate-700">{direction.fallingPercent}% ({direction.fallingCount})</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${direction.fallingPercent}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-600 flex items-center gap-1">
                        <Activity size={13} /> Stable (&plusmn;0.5%)
                      </span>
                      <span className="font-mono font-bold text-slate-700">{direction.stablePercent}% ({direction.stableCount})</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-slate-400 h-full rounded-full transition-all" style={{ width: `${direction.stablePercent}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-rose-700 flex items-center gap-1">
                        <TrendingUp size={13} /> Rose in Price
                      </span>
                      <span className="font-mono font-bold text-slate-700">{direction.risingPercent}% ({direction.risingCount})</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full transition-all" style={{ width: `${direction.risingPercent}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                Mean: <strong className="text-slate-700 font-mono">{direction.averageChangePercent}%</strong> | Median: <strong className="text-emerald-700 font-mono">{direction.medianChangePercent}%</strong>
              </div>
            </div>
          </div>

          {/* Statistical Insight / Asymmetry Disclosure */}
          <div className="bg-indigo-50/60 rounded-xl p-3 border border-indigo-100 flex items-start gap-2 text-xs text-indigo-950">
            <Info size={15} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold">Distribution Analysis: </span>
              {direction.asymmetryExplanation}
            </div>
          </div>
        </div>

        {/* SECTION 2: Top Verified Recent Price Drops */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">2. Top Verified Recent Price Drops</h2>
                <Badge variant="success">{topPriceDrops.length} Detected</Badge>
              </div>
              <p className="text-xs text-slate-500">
                Verified price cuts detected from sequential timestamped store observations. No mock, synthetic, or backfilled entries.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setDropSort("savings")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  dropSort === "savings" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sort by Amount (₹)
              </button>
              <button
                onClick={() => setDropSort("percent")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  dropSort === "percent" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sort by % Drop
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="pb-3 pl-2">Product</th>
                  <th className="pb-3">Retailer</th>
                  <th className="pb-3">Current Price</th>
                  <th className="pb-3">Previous Price</th>
                  <th className="pb-3">Price Cut</th>
                  <th className="pb-3 hidden md:table-cell">Recorded At</th>
                  <th className="pb-3 text-right pr-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDrops.length > 0 ? (
                  sortedDrops.map((drop) => (
                    <tr key={`${drop.productId}-${drop.retailer}`} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3 pl-2">
                        <Link to={drop.productLink} className="flex items-center gap-3">
                          <img
                            src={resolveImageUrl(drop.imageUrl, drop.brand)}
                            alt={drop.productName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 object-contain bg-slate-50 rounded-lg p-1 border border-slate-200"
                          />
                          <div className="min-w-0 max-w-xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">{drop.brand}</span>
                            <span className="font-semibold text-slate-900 truncate block group-hover:text-indigo-600 transition-colors">
                              {drop.productName}
                            </span>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <StoreIcon size={12} className="text-slate-500" />
                          {drop.retailer}
                        </span>
                      </td>
                      <td className="py-3 font-mono font-bold text-emerald-700">
                        {fmt(drop.currentPrice)}
                      </td>
                      <td className="py-3 font-mono text-slate-400 line-through">
                        {fmt(drop.previousPrice)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-mono">
                            -{fmt(drop.absoluteChange)}
                          </span>
                          <span className="text-xs font-semibold text-emerald-700">
                            ({drop.percentageChange}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-xs text-slate-400 font-mono hidden md:table-cell">
                        {new Date(drop.timestamp).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-3 text-right pr-2">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={drop.productLink}
                            className="px-3 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors inline-flex items-center gap-1"
                          >
                            Details
                          </Link>
                          {drop.storeUrl && (
                            <a
                              href={drop.storeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              Store <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                      No price drops detected in current active window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: Retailer Competitiveness */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">3. Retailer Competitiveness Leaderboard</h2>
                <Badge variant="primary">Multi-Platform Comparison</Badge>
              </div>
              <p className="text-xs text-slate-500">
                Win rate and pricing premium calculated exclusively from identical smartphones actively in stock across &ge;2 retailers within the last 7 days.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
              Freshness Window: 7 Days (168h)
            </span>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {retailerCompetitiveness.map((retailer, idx) => (
              <div
                key={retailer.storeName}
                className={`rounded-xl border p-4 transition-all ${
                  idx === 0
                    ? "bg-indigo-50/50 border-indigo-200 shadow-2xs"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                    }`}>
                      {retailer.storeName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-slate-900 text-sm">{retailer.storeName}</h3>
                        {idx === 0 && (
                          <span className="text-[10px] font-bold bg-indigo-200/80 text-indigo-900 px-1.5 py-0.2 rounded">
                            #1 Price Leader
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">
                        {retailer.activeListingsCount} in-stock models
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold font-mono text-indigo-700">
                      {retailer.winRatePercent}%
                    </span>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Win Rate</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        idx === 0 ? "bg-indigo-600" : "bg-slate-400"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(5, retailer.winRatePercent))}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Shared</span>
                    <span className="font-mono font-bold text-slate-700">{retailer.sharedListingsCount}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase" title={`${retailer.exclusiveWins} sole wins, ${retailer.tiedWins} tied wins`}>Solo / Tied</span>
                    <span className="font-mono font-bold text-emerald-700 text-[11px]">{retailer.exclusiveWins} / {retailer.tiedWins}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Market Share</span>
                    <span className="font-mono font-bold text-slate-700">{retailer.marketLowestShare}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">vs Best</span>
                    <span className={`font-mono font-bold ${retailer.avgPriceDifferenceVsBest <= 2 ? "text-emerald-700" : "text-amber-700"}`}>
                      +{retailer.avgPriceDifferenceVsBest}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200/60 flex items-start gap-2 leading-relaxed">
            <Info size={15} className="text-slate-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-700">Competitiveness Methodology: </strong>
              Win rate represents <span className="font-mono">P(Lowest Price | In-Stock at Store)</span>. Percentages across retailers can sum to &gt;100% due to retailer-specific denominators (e.g. Amazon competed on 51 items, while Croma and Flipkart competed on 39 items) and price ties where multiple stores match the identical best price. Listings out of stock or older than 7 days are strictly excluded.
            </div>
          </div>
        </div>

        {/* SECTION 4: Volatility and Stability */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Most Volatile */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">4a. Most Volatile Smartphones</h2>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    High Swings
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Frequent price adjustments, flash sales, and retailer discounts.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {volatility.mostVolatile.map((item, idx) => (
                <div
                  key={item.productId}
                  className="p-3 rounded-xl border border-slate-100 hover:border-indigo-200 bg-slate-50/50 hover:bg-white transition-all flex items-center justify-between gap-3 group"
                >
                  <Link to={item.productLink} className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={resolveImageUrl(item.imageUrl, item.brand)}
                      alt={item.productName}
                      className="w-10 h-10 object-contain bg-white rounded-lg p-1 border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-indigo-600 block">{item.brand}</span>
                      <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                        {item.productName}
                      </p>
                      <span className="text-[11px] text-slate-400">
                        Range: {fmt(item.lowestPrice)} – {fmt(item.highestPrice)} ({item.daysCovered}d)
                      </span>
                    </div>
                  </Link>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      &plusmn;{item.volatilityPercent}% CV
                    </span>
                    <p className="text-xs font-bold text-slate-900 font-mono mt-1">{fmt(item.currentPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Most Stable */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">4b. Most Stable Smartphones</h2>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    Predictable
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consistent pricing over time with negligible historical variation.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {volatility.mostStable.map((item, idx) => (
                <div
                  key={item.productId}
                  className="p-3 rounded-xl border border-slate-100 hover:border-emerald-200 bg-slate-50/50 hover:bg-white transition-all flex items-center justify-between gap-3 group"
                >
                  <Link to={item.productLink} className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={resolveImageUrl(item.imageUrl, item.brand)}
                      alt={item.productName}
                      className="w-10 h-10 object-contain bg-white rounded-lg p-1 border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-emerald-600 block">{item.brand}</span>
                      <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-emerald-700 transition-colors">
                        {item.productName}
                      </p>
                      <span className="text-[11px] text-slate-400">
                        {item.historyPoints} observations across {item.daysCovered} days
                      </span>
                    </div>
                  </Link>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {item.volatilityPercent}% CV
                    </span>
                    <p className="text-xs font-bold text-slate-900 font-mono mt-1">{fmt(item.currentPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Minimum History Disclosure */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Info size={15} className="text-slate-400 shrink-0" />
            <span>
              <strong>Minimum History Enforcement:</strong> Products require at least 5 price observations spanning at least 14 days to qualify for volatility ranking.
            </span>
          </div>
          <span className="font-semibold text-slate-700 bg-white px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
            {volatility.insufficientHistoryCount} products held for observation
          </span>
        </div>

        {/* SECTION 5: Best Buying Opportunities */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">5. Best Buying Opportunities Today</h2>
                <Badge variant="success">Validated BUY Verdict</Badge>
              </div>
              <p className="text-xs text-slate-500">
                Products currently within 2% of their all-time lowest recorded price or &gt;5% below their 90-day historical average, confirmed by trend projections.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Sorted by discount magnitude vs 90d average
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {buyingOpportunities.map((opp) => (
              <div
                key={opp.productId}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <img
                      src={resolveImageUrl(opp.imageUrl, opp.brand)}
                      alt={opp.productName}
                      className="w-14 h-14 object-contain bg-slate-50 rounded-xl p-1.5 border border-slate-100"
                    />
                    <div className="text-right">
                      {opp.isNearAllTimeLow && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full block mb-1">
                          All-Time Low
                        </span>
                      )}
                      <span className="text-xs font-bold text-emerald-700 font-mono">
                        {opp.discountFromAveragePercent}% below 90d
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">{opp.brand}</span>
                  <Link
                    to={opp.productLink}
                    className="text-sm font-bold text-slate-900 line-clamp-2 mt-0.5 mb-3 group-hover:text-indigo-600 transition-colors"
                  >
                    {opp.productName}
                  </Link>
                </div>

                <div>
                  <div className="bg-slate-50 rounded-xl p-2.5 mb-3 border border-slate-100 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current Deal:</span>
                      <span className="font-bold text-slate-900 font-mono">{fmt(opp.currentPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">90d Average:</span>
                      <span className="font-mono text-slate-600">{fmt(opp.average90)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                      <span className="text-slate-400">30d Projection (pred.):</span>
                      <span className="font-mono text-indigo-700 font-semibold">{fmt(opp.predicted30d)}</span>
                    </div>
                  </div>

                  <Link
                    to={opp.productLink}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    View Product & Stores <ArrowUpRight size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-500 flex items-center gap-2">
            <Info size={14} className="text-slate-400 shrink-0" />
            <span>
              <strong>Forecast Notice:</strong> 30-day price projections are statistical trend estimates based on historical observations, not guaranteed future prices. Buy recommendations reflect current historical value and are not financial guarantees of future price changes.
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}
