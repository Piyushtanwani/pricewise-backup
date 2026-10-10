import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router"
import {
  Star, Heart, Bell, GitCompare, ExternalLink, TrendingDown, Sparkles,
  CheckCircle, AlertTriangle, ChevronRight, Info, Layers
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend
} from "recharts"
import { products as mockProducts, priceHistoryData, predictionData as mockPredictionData } from "../data/mockData"
import {
  getProductById,
  getProductHistory,
  getProductPrediction,
  getProductAlternatives,
  type ProductDetailResponse,
  type Product
} from "../services/api"
import Badge from "../components/ui/Badge"
import ProductCard from "../components/ui/ProductCard"

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

const timeRanges = ["7D", "30D", "3M", "6M", "1Y", "All"]

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [liveDetail, setLiveDetail] = useState<ProductDetailResponse | null>(null)
  const [historyPoints, setHistoryPoints] = useState<any[]>([])
  const [predictionData, setPredictionData] = useState<any>(null)
  const [alternatives, setAlternatives] = useState<Product[]>([])
  const [timeRange, setTimeRange] = useState("3M")
  const [wished, setWished] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [alertPrice, setAlertPrice] = useState("")
  const [tab, setTab] = useState<"history" | "prediction">("history")
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    getProductById(id)
      .then((data) => {
        if (data) {
          setLiveDetail(data)
          if (data.card.image) setSelectedImage(data.card.image)
        }
      })
      .finally(() => setLoading(false))

    getProductHistory(id, timeRange).then((pts) => {
      if (pts && pts.length > 0) setHistoryPoints(pts)
    })

    getProductPrediction(id).then((pred) => {
      if (pred) setPredictionData(pred)
    })

    getProductAlternatives(id, 4).then((alts) => {
      if (alts && alts.length > 0) setAlternatives(alts)
    })
  }, [id])

  useEffect(() => {
    if (id) {
      getProductHistory(id, timeRange).then((pts) => {
        if (pts && pts.length > 0) setHistoryPoints(pts)
      })
    }
  }, [id, timeRange])

  if (loading && !liveDetail) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-28 px-6 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-600 font-medium text-sm">Loading verified product details & price history...</p>
      </div>
    )
  }

  const fallbackProduct = mockProducts.find((p) => p.id === id) || (mockProducts[0] as Product)
  const product: Product = liveDetail?.card || fallbackProduct
  const storePrices = liveDetail?.storePrices && liveDetail.storePrices.length > 0 ? liveDetail.storePrices : []
  const chartData = historyPoints.length > 0 ? historyPoints : (product.priceHistory?.length ? product.priceHistory.map((p, i) => ({ date: `Pt ${i+1}`, price: p })) : priceHistoryData)
  const savings = Math.max(0, product.mrp - product.bestPrice)
  const displayImage = selectedImage || product.image || (product as any).imageUrl || ""

  // Stats calculation
  const statsLowest = liveDetail?.stats?.lowestEver ?? liveDetail?.stats?.lowest90 ?? product.bestPrice
  const statsHighest = liveDetail?.stats?.highest90 ?? product.mrp
  const statsAverage = liveDetail?.stats?.average90 ?? Math.round(product.bestPrice * 1.05)

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
          {["Home", product.category, product.brand, product.name].map((crumb, i, arr) => (
            <span key={crumb + i} className="flex items-center gap-1.5">
              {i < arr.length - 1 ? (
                <button
                  onClick={() => (i === 0 ? navigate("/") : navigate(`/search?q=${encodeURIComponent(crumb)}`))}
                  className="hover:text-indigo-600 transition-colors"
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
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-3">
              <div className="aspect-square p-8 flex items-center justify-center bg-slate-50">
                <img
                  src={displayImage}
                  alt={product.name}
                  className="max-h-full max-w-full object-contain rounded-xl hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>
            {liveDetail?.images && liveDetail.images.length > 1 ? (
              <div className="grid grid-cols-4 gap-2">
                {liveDetail.images.slice(0, 4).map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(img)}
                    className={`bg-white rounded-xl border aspect-square p-2 overflow-hidden transition-all ${
                      displayImage === img ? "border-indigo-600 ring-2 ring-indigo-200" : "border-slate-200 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Info */}
          <div className="lg:col-span-3">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-1">{product.brand}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight mb-3">{product.name}</h1>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    className={i < Math.floor(product.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200"}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-slate-700">{product.rating}</span>
              <span className="text-sm text-slate-400">({product.reviews.toLocaleString("en-IN")} verified reviews)</span>
            </div>

            {/* Price block */}
            <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 mb-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-4xl font-bold text-slate-900">{fmt(product.bestPrice)}</span>
                    {product.mrp > product.bestPrice && (
                      <span className="text-lg text-slate-400 line-through">{fmt(product.mrp)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {savings > 0 && <Badge variant="success">Save {fmt(savings)}</Badge>}
                    {product.discount > 0 && <Badge variant="success">{product.discount}% OFF</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-1">Lowest price at</p>
                  <p className="text-sm font-bold text-slate-800">{product.bestStore}</p>
                  <p className="text-xs text-slate-500">{storePrices.length || product.stores} stores compared</p>
                </div>
              </div>

              <a
                href="#stores"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mb-2"
              >
                View Store Deals <ExternalLink size={15} />
              </a>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setTracking(!tracking)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
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
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    wished
                      ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-white text-slate-700 border-slate-200 hover:border-red-300"
                  }`}
                >
                  <Heart size={13} className={wished ? "fill-red-500" : ""} />
                  Wishlist
                </button>
                <button
                  onClick={() => navigate("/compare")}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border bg-white text-slate-700 border-slate-200 hover:border-indigo-300 transition-colors"
                >
                  <GitCompare size={13} />
                  Compare
                </button>
              </div>
            </div>

            {/* AI Verdict */}
            <div className={`border rounded-2xl p-4 mb-4 ${
              product.verdictColor === "green" ? "bg-emerald-50 border-emerald-200 text-emerald-900" :
              product.verdictColor === "amber" ? "bg-amber-50 border-amber-200 text-amber-900" :
              "bg-indigo-50 border-indigo-200 text-indigo-900"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-white/70 rounded-lg flex items-center justify-center">
                  <Sparkles size={14} className="text-indigo-600" />
                </div>
                <p className="text-sm font-bold">PriceWise AI Verdict</p>
                <Badge variant={product.verdictColor === "green" ? "success" : product.verdictColor === "amber" ? "warning" : "info"} className="ml-auto">
                  {liveDetail?.verdict?.label || product.aiVerdict}
                </Badge>
              </div>
              <p className="text-base font-bold mb-1">
                {liveDetail?.verdict?.label || product.aiVerdict}
              </p>
              <p className="text-sm leading-relaxed opacity-90">
                {liveDetail?.verdict?.explanation || liveDetail?.verdict?.description || `Current lowest price is ${fmt(product.bestPrice)} on ${product.bestStore}. Analysis shows favorable purchasing conditions.`}
              </p>
            </div>

            {/* Key specs highlight */}
            {product.specs && product.specs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.specs.map((s, idx) => (
                  <span key={idx} className="text-xs font-medium bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-full shadow-xs">
                    {typeof s === "string" ? s : typeof s === "object" ? JSON.stringify(s) : String(s)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Store Price Comparison Table */}
        <div id="stores" className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Multi-Store Price Comparison</h2>
            <span className="text-xs text-slate-500 font-medium">Real-time Retailer Data</span>
          </div>

          {storePrices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3">Retailer</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3">Price</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden sm:table-cell">Shipping</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden md:table-cell">Status</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden lg:table-cell">Difference</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {storePrices.map((store, i) => (
                    <tr key={store.store + i} className={`${i === 0 ? "bg-emerald-50/60" : ""} hover:bg-slate-50 transition-colors`}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          {store.logoUrl ? (
                            <img src={store.logoUrl} alt={store.store} className="w-5 h-5 object-contain" />
                          ) : (
                            <span className="text-base">🏪</span>
                          )}
                          <div>
                            <p className="font-semibold text-slate-800">{store.store}</p>
                            {i === 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded-full font-medium">Lowest Price</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-base font-bold ${i === 0 ? "text-emerald-700" : "text-slate-800"}`}>
                          {fmt(store.price)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 hidden sm:table-cell">
                        <span className="text-slate-600">{store.shipping || "Free Delivery"}</span>
                      </td>
                      <td className="py-3 pr-4 hidden md:table-cell">
                        <Badge variant={store.availability === "In Stock" || store.availability === "IN_STOCK" ? "success" : "warning"}>
                          {store.availability || "In Stock"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 hidden lg:table-cell">
                        {store.diff > 0 ? (
                          <span className="text-red-500 text-xs font-mono font-medium">+{fmt(store.diff)}</span>
                        ) : (
                          <span className="text-emerald-600 text-xs font-mono font-bold">Best Deal</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={store.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          Visit Store <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Retailer price comparisons are currently being synchronized for this product.</p>
          )}
        </div>

        {/* Charts & Trends */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("history")}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  tab === "history" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Price History
              </button>
              <button
                onClick={() => setTab("prediction")}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  tab === "prediction" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                AI Price Prediction
              </button>
            </div>

            {tab === "history" && (
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                {timeRanges.map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      timeRange === r ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tab === "history" ? (
            <>
              <div className="grid grid-cols-4 gap-3 mb-6 p-3 bg-slate-50 rounded-xl">
                {[
                  { label: "All-Time Low", value: fmt(statsLowest), color: "text-emerald-700" },
                  { label: "90-Day High", value: fmt(statsHighest), color: "text-red-600" },
                  { label: "90-Day Avg", value: fmt(statsAverage), color: "text-slate-700" },
                  { label: "Current Price", value: fmt(product.bestPrice), color: "text-indigo-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <ResponsiveContainer width="100%" height={270}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                      domain={['auto', 'auto']}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      formatter={(v) => [typeof v === "number" ? fmt(v) : String(v), "Price"]}
                    />
                    <ReferenceLine
                      y={statsAverage}
                      stroke="#94a3b8"
                      strokeDasharray="4 2"
                      label={{ value: "90d Avg", position: "right", fontSize: 10, fill: "#94a3b8" }}
                    />
                    <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#priceGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-4">
                <Info size={14} className="text-indigo-600 shrink-0" />
                <p className="text-xs text-indigo-700">
                  Price predictions are computed by our machine learning models based on 6+ months of historical retailer cycle data.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  {
                    label: "Predicted in 7 days",
                    value: fmt(predictionData?.predicted7d ?? predictionData?.forecast7d?.price ?? Math.round(product.bestPrice * 0.98)),
                    badge: predictionData?.confidence ? `${predictionData.confidence} confidence` : "Moderate confidence",
                  },
                  {
                    label: "Predicted in 30 days",
                    value: fmt(predictionData?.predicted30d ?? predictionData?.forecast30d?.price ?? Math.round(product.bestPrice * 0.95)),
                    badge: predictionData?.recommendation ? `Signal: ${predictionData.recommendation}` : "Forecast trend",
                  },
                  {
                    label: "Potential Saving",
                    value: fmt(predictionData?.potentialSaving !== undefined ? predictionData.potentialSaving : Math.round(product.bestPrice * 0.05)),
                    badge: "vs current",
                  },
                ].map(({ label, value, badge }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className="text-base font-bold font-mono text-indigo-700">{value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{badge}</p>
                  </div>
                ))}
              </div>
              <div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={predictionData?.points || mockPredictionData}>
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
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={55} />
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

        {/* AI Analysis & Insights */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">AI Price Intelligence & Analysis</h2>
          </div>
          <div className="space-y-2.5">
            {(liveDetail?.insights && liveDetail.insights.length > 0
              ? liveDetail.insights
              : [
                  `Current price of ${fmt(product.bestPrice)} is verified across ${product.bestStore}.`,
                  product.discount > 0 ? `Running a ${product.discount}% discount below maximum retail price.` : "Listed at standard retail price.",
                  `All-time lowest price recorded is ${fmt(statsLowest)}.`,
                ]
            ).map((item: any, idx: number) => {
              const text = typeof item === "string" ? item : item?.text || "";
              const isWarn = typeof item === "object" && item?.type === "warn";
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 p-3.5 rounded-xl border ${
                    isWarn ? "bg-amber-50/70 border-amber-100" : "bg-emerald-50/70 border-emerald-100"
                  }`}
                >
                  {isWarn ? (
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <p className={`text-sm font-medium ${isWarn ? "text-amber-900" : "text-emerald-900"}`}>
                    {text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Technical Specifications */}
        {liveDetail?.techSpecs && Object.keys(liveDetail.techSpecs).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700">
                <Layers size={14} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Full Technical Specifications</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2.5">
              {Object.entries(liveDetail.techSpecs).map(([key, val]) => (
                <div key={key} className="flex justify-between py-2 border-b border-slate-100 text-sm">
                  <span className="text-slate-500 font-medium">{key}</span>
                  <span className="text-slate-900 font-semibold text-right max-w-xs">
                    {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Description */}
        {liveDetail?.description && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-3">About this Product</h2>
            <div
              className="text-sm text-slate-600 leading-relaxed space-y-2"
              dangerouslySetInnerHTML={{ __html: liveDetail.description }}
            />
          </div>
        )}

        {/* Smart Alternatives */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Smart Alternatives in this Category</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(alternatives.length > 0 ? alternatives : mockProducts.filter((p) => p.id !== product.id).slice(0, 4)).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>

        {/* Price Alert Setup */}
        <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={18} className="text-indigo-300" />
            <h2 className="text-lg font-bold text-white">Set a Price Drop Alert</h2>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            We track this product around the clock and notify you the moment it drops below your target price.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Target Price (₹)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                  placeholder={`e.g. ${Math.round(product.bestPrice * 0.9)}`}
                  className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-slate-500 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {[0.95, 0.9, 0.85].map((multiplier) => {
                  const target = Math.round(product.bestPrice * multiplier)
                  return (
                    <button
                      key={multiplier}
                      onClick={() => setAlertPrice(String(target))}
                      className="text-xs text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1 rounded-full transition-colors font-mono"
                    >
                      {fmt(target)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Notification Channels</label>
              <div className="flex gap-4 flex-wrap pt-2">
                {["Email Alert", "In-App Notification", "Push"].map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" defaultChecked={ch !== "Push"} className="rounded border-white/20 bg-white/10 text-indigo-500" />
                    <span className="text-sm text-slate-300">{ch}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button className="mt-4 bg-white text-indigo-900 font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors text-sm flex items-center gap-2">
            <Bell size={14} />
            Set Price Alert
          </button>
        </div>
      </div>
    </div>
  )
}
