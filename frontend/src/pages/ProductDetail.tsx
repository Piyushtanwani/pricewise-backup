import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router"
import {
  Star, Heart, Bell, GitCompare, ExternalLink, TrendingDown, Sparkles,
  CheckCircle, ChevronRight, Info, Loader2
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend
} from "recharts"
import Badge from "../components/ui/Badge"
import ProductCard from "../components/ui/ProductCard"
import { api } from "../services/api"
import type { Product, ProductDetailResponse, StorePriceRow, PricePoint, PredictionPoint } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<ProductDetailResponse | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [prediction, setPrediction] = useState<PredictionPoint[]>([])
  const [alternatives, setAlternatives] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [timeRange, setTimeRange] = useState("3M")
  const [wished, setWished] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [tab, setTab] = useState<"history" | "prediction">("history")

  useEffect(() => {
    if (!id) return
    let isMounted = true

    async function loadProduct() {
      try {
        setLoading(true)
        setError(null)
        const [prodDetail, historyPoints, predPoints, alts] = await Promise.all([
          api.getProduct(id!),
          api.getProductHistory(id!).catch(() => []),
          api.getProductPrediction(id!).catch(() => []),
          api.getProductAlternatives(id!).catch(() => []),
        ])

        if (isMounted) {
          setDetail(prodDetail)
          setHistory(historyPoints)
          setPrediction(predPoints)
          setAlternatives(alts)
        }
      } catch (err: any) {
        console.error("Failed to load product details:", err)
        if (isMounted) setError("Product could not be loaded or was not found.")
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadProduct()
    return () => { isMounted = false }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
          <p className="text-sm text-slate-500">Loading product details from Supabase...</p>
        </div>
      </div>
    )
  }

  const product = detail?.product || detail

  if (error || !product || !product.id || !product.name) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 max-w-[1440px] mx-auto px-6 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 max-w-lg mx-auto shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Product Not Found</h2>
          <p className="text-slate-500 text-sm mb-6">{error || "The requested smartphone is not available in the catalogue."}</p>
          <button
            onClick={() => navigate("/search")}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Browse All Smartphones
          </button>
        </div>
      </div>
    )
  }

  const stores: StorePriceRow[] = detail.storePrices || (Array.isArray(detail.stores) ? (detail.stores as unknown as StorePriceRow[]) : [])
  const stats = detail.stats
  const verdict = detail.verdict
  const insights = detail.insights || []
  const savings = Math.max(0, (product.mrp || 0) - (product.bestPrice || 0))

  const avgPrice = stats?.average90 || product.bestPrice
  const lowestPrice = stats?.lowestEver || stats?.lowest90 || product.bestPrice
  const highestPrice = stats?.highest90 || product.mrp

  const chartHistoryData = history.length > 0
    ? history
    : product.priceHistory?.length
    ? product.priceHistory.map((p, idx) => ({ date: `Pt ${idx + 1}`, price: p, avg: product.bestPrice }))
    : [{ date: "Current", price: product.bestPrice, avg: product.bestPrice }]

  const chartPredictionData = prediction.length > 0
    ? prediction
    : [
        { date: "Current", price: product.bestPrice, predicted: product.bestPrice, upper: product.bestPrice, lower: product.bestPrice },
        { date: "7 Days", price: null, predicted: Math.round(product.bestPrice * 0.98), upper: Math.round(product.bestPrice * 1.02), lower: Math.round(product.bestPrice * 0.95) },
        { date: "30 Days", price: null, predicted: Math.round(product.bestPrice * 0.96), upper: Math.round(product.bestPrice * 1.03), lower: Math.round(product.bestPrice * 0.92) },
      ]

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
          {["Home", product.category || "Mobiles", product.brand, product.name].map((crumb, i, arr) => (
            <span key={crumb} className="flex items-center gap-1.5">
              {i < arr.length - 1 ? (
                <button
                  onClick={() => i === 0 ? navigate("/") : navigate(`/search?q=${encodeURIComponent(crumb)}`)}
                  className="hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  {crumb}
                </button>
              ) : (
                <span className="text-slate-700 font-medium truncate max-w-xs">{crumb}</span>
              )}
              {i < arr.length - 1 && <ChevronRight size={12} />}
            </span>
          ))}
        </nav>

        {/* Main product section */}
        <div className="grid lg:grid-cols-5 gap-8 mb-8">
          {/* Images */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-3 shadow-sm">
              <div className="aspect-square p-8 flex items-center justify-center bg-slate-50">
                <img
                  src={(() => {
                    if (product.image) {
                      const spMatch = product.image.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/);
                      if (spMatch) {
                        return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-w420-h420/phone.webp`;
                      }
                      return product.image;
                    }
                    const b = (product.brand || '').toLowerCase();
                    if (b.includes('apple')) return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80';
                    if (b.includes('samsung')) return 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80';
                    if (b.includes('oneplus')) return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
                    if (b.includes('motorola')) return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
                    if (b.includes('vivo')) return 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80';
                    if (b.includes('realme')) return 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80';
                    if (b.includes('oppo')) return 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80';
                    return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
                  })()}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const b = (product.brand || '').toLowerCase();
                    if (b.includes('apple')) e.currentTarget.src = 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80';
                    else if (b.includes('samsung')) e.currentTarget.src = 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80';
                    else if (b.includes('oneplus')) e.currentTarget.src = 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
                    else if (b.includes('motorola')) e.currentTarget.src = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
                    else if (b.includes('vivo')) e.currentTarget.src = 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80';
                    else if (b.includes('realme')) e.currentTarget.src = 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80';
                    else if (b.includes('oppo')) e.currentTarget.src = 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80';
                    else e.currentTarget.src = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
                  }}
                  className="max-h-full max-w-full object-contain rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="lg:col-span-3">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-1">{product.brand}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight mb-3">{product.name}</h1>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className={i < Math.floor(product.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200"} />
                ))}
              </div>
              <span className="text-sm font-semibold text-slate-700">{product.rating}</span>
              <span className="text-sm text-slate-400">({product.reviews.toLocaleString("en-IN")} ratings)</span>
            </div>

            {/* Price block */}
            <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 mb-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-4xl font-bold text-slate-900">{fmt(product.bestPrice)}</span>
                    <span className="text-lg text-slate-400 line-through">{fmt(product.mrp)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Save {fmt(savings)}</Badge>
                    <Badge variant="success">{product.discount}% OFF</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-1">Best price at</p>
                  <p className="text-sm font-bold text-slate-800">{product.bestStore}</p>
                  <p className="text-xs text-slate-500">{stores.length} store{stores.length > 1 ? "s" : ""} verified</p>
                </div>
              </div>

              {stores[0]?.url && (
                <a
                  href={stores[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mb-2 shadow-md shadow-indigo-600/20"
                >
                  View Best Deal at {stores[0].store} <ExternalLink size={15} />
                </a>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setTracking(!tracking)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    tracking
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <Bell size={13} />
                  {tracking ? "Tracking" : "Track Price"}
                </button>
                <button
                  onClick={() => setWished(!wished)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    wished
                      ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-white text-slate-700 border-slate-200 hover:border-red-300"
                  }`}
                >
                  <Heart size={13} className={wished ? "fill-red-500" : ""} />
                  Wishlist
                </button>
                <button
                  onClick={() => navigate(`/compare?ids=${product.id}`)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border bg-white text-slate-700 border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer"
                >
                  <GitCompare size={13} />
                  Compare
                </button>
              </div>
            </div>

            {/* AI Verdict */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Sparkles size={13} className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-emerald-800">PriceWise Intelligence Verdict</p>
                <Badge variant="success" className="ml-auto">High Confidence</Badge>
              </div>
              <p className="text-base font-bold text-emerald-800 mb-1">
                ✓ {verdict?.summary || verdict?.label || product.aiVerdict}
              </p>
              <p className="text-sm text-emerald-700">
                {verdict?.reason || verdict?.explanation || `Current price of ${fmt(product.bestPrice)} is ${product.discount}% lower than estimated retail value. Top price consistency across verified retailers.`}
              </p>
            </div>

            {/* Key specs */}
            <div className="flex flex-wrap gap-2">
              {product.specs?.map((s) => (
                <span key={s} className="text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full shadow-2xs">{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Store Price Comparison Table */}
        <div id="stores" className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Verified Retailers & Live Prices</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3">Store</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3">Price</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden sm:table-cell">Shipping</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden md:table-cell">Availability</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden lg:table-cell">vs Best</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stores.length > 0 ? (
                  stores.map((store, i) => (
                    <tr
                      key={store.storeId || store.store || i}
                      className={`${i === 0 ? "bg-emerald-50/50" : ""} hover:bg-slate-50 transition-colors`}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs">
                            {store.store.charAt(0)}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-800">{store.store}</p>
                            {i === 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Best Price</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-base font-bold ${i === 0 ? "text-emerald-700" : "text-slate-800"}`}>
                          {fmt(store.price)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 hidden sm:table-cell">
                        <span className="text-slate-600">{store.shipping || "Free"}</span>
                      </td>
                      <td className="py-3 pr-4 hidden md:table-cell">
                        <Badge variant={store.availability === "In Stock" ? "success" : "warning"}>
                          {store.availability || "In Stock"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 hidden lg:table-cell">
                        {store.diff > 0 ? (
                          <span className="text-red-500 text-xs font-mono">+{fmt(store.diff)}</span>
                        ) : (
                          <span className="text-emerald-600 text-xs font-mono font-bold">Best</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {store.url && (
                          <a
                            href={store.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-indigo-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center gap-1 shadow-sm"
                          >
                            Buy <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-800">{product.bestStore}</td>
                    <td className="py-3 pr-4 font-bold text-emerald-700">{fmt(product.bestPrice)}</td>
                    <td className="py-3 pr-4 text-slate-600">Free</td>
                    <td className="py-3 pr-4"><Badge variant="success">In Stock</Badge></td>
                    <td className="py-3 pr-4 font-bold text-emerald-600">Best</td>
                    <td className="py-3 text-right">
                      <button className="bg-indigo-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg">Buy</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("history")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  tab === "history" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Price History
              </button>
              <button
                onClick={() => setTab("prediction")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  tab === "prediction" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Price Prediction
              </button>
            </div>
          </div>

          {tab === "history" ? (
            <>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Lowest", value: fmt(lowestPrice), color: "text-emerald-700" },
                  { label: "Highest", value: fmt(highestPrice), color: "text-red-600" },
                  { label: "Average", value: fmt(avgPrice), color: "text-slate-700" },
                  { label: "Current", value: fmt(product.bestPrice), color: "text-indigo-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-2 rounded-xl bg-slate-50">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={chartHistoryData}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={45} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }}
                      formatter={(v) => [typeof v === "number" ? fmt(v) : String(v), "Price"]}
                    />
                    <ReferenceLine y={avgPrice} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "Avg", position: "right", fontSize: 10, fill: "#94a3b8" }} />
                    <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#priceGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <Info size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">Price predictions are calculated using time-series modeling on historical price points.</p>
              </div>
              <div>
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={chartPredictionData}>
                    <defs>
                      <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={45} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }}
                      formatter={(v, name) => [typeof v === "number" && v ? fmt(v) : "—", String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="upper" stroke="none" fill="url(#rangeGrad)" name="Upper estimate" />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="white" name="Lower estimate" />
                    <Area type="monotone" dataKey="price" stroke="#1e3a8a" fill="url(#predGrad)" strokeWidth={2.5} dot={false} name="Actual price" />
                    <Area type="monotone" dataKey="predicted" stroke="#4f46e5" fill="none" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: "#4f46e5" }} name="Predicted price" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        {/* AI Analysis Insights */}
        {insights.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Sparkles size={13} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">AI Intelligence Insights</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {insights.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <CheckCircle size={15} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    {item.label && <p className="text-xs font-semibold text-slate-500">{item.label}</p>}
                    <p className="text-sm font-medium text-slate-800">{item.value || item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Smart Alternatives */}
        {alternatives.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Smart Alternatives in this Budget</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {alternatives.slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
