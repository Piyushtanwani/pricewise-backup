import { useState } from "react"
import { useParams, useNavigate } from "react-router"
import {
  Star, Heart, Bell, GitCompare, ExternalLink, TrendingDown, Sparkles,
  CheckCircle, AlertTriangle, ChevronRight, Info
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend
} from "recharts"
import { products, storePrices, priceHistoryData, predictionData } from "../data/mockData"
import Badge from "../components/ui/Badge"
import ProductCard from "../components/ui/ProductCard"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const timeRanges = ["7D", "30D", "3M", "6M", "1Y"]

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const product = products.find((p) => p.id === id) || products[0]

  const [timeRange, setTimeRange] = useState("3M")
  const [wished, setWished] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [alertPrice, setAlertPrice] = useState("")
  const [tab, setTab] = useState("history")

  const savings = product.mrp - product.bestPrice

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
          {["Home", "Electronics", product.category, product.name].map((crumb, i, arr) => (
            <span key={crumb} className="flex items-center gap-1.5">
              {i < arr.length - 1 ? (
                <button
                  onClick={() => i === 0 ? navigate("/") : navigate(`/search?q=${crumb}`)}
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
              <div className="aspect-square p-8">
                <img src={product.image} alt={product.name} className="w-full h-full object-cover rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 aspect-square p-2">
                  <img src={product.image} alt="" className="w-full h-full object-cover rounded-lg opacity-60 hover:opacity-100 cursor-pointer transition-opacity" />
                </div>
              ))}
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
              <span className="text-sm text-slate-400">({product.reviews.toLocaleString("en-IN")} reviews)</span>
            </div>

            {/* Price block */}
            <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 mb-5">
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
                  <p className="text-xs text-slate-500">{product.stores} stores compared</p>
                </div>
              </div>

              <a
                href="#stores"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mb-2"
              >
                View Best Deal <ExternalLink size={15} />
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
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Sparkles size={13} className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-emerald-800">PriceWise Verdict</p>
                <Badge variant="success" className="ml-auto">High Confidence</Badge>
              </div>
              <p className="text-base font-bold text-emerald-800 mb-1">✓ Good time to buy</p>
              <p className="text-sm text-emerald-700">
                Current price is 12% below its 90-day average of {fmt(Math.round(product.mrp * 0.88))}. Historically, this product rarely drops below its current price point.
              </p>
            </div>

            {/* Key specs */}
            <div className="flex flex-wrap gap-2">
              {product.specs.map((s) => (
                <span key={s} className="text-sm bg-white border border-slate-200 text-slate-700 px-3 py-1 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Store Price Comparison */}
        <div id="stores" className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Price Comparison</h2>
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
                {storePrices.map((store, i) => (
                  <tr
                    key={store.store}
                    className={`${i === 0 ? "bg-emerald-50" : ""} hover:bg-slate-50 transition-colors`}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{store.logo}</span>
                        <div>
                          <p className="font-semibold text-slate-800">{store.store}</p>
                          {i === 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 rounded-full">Best Price</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-base font-bold ${i === 0 ? "text-emerald-700" : "text-slate-800"}`}>
                        {fmt(store.price)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 hidden sm:table-cell">
                      <span className="text-slate-600">{store.shipping}</span>
                    </td>
                    <td className="py-3 pr-4 hidden md:table-cell">
                      <Badge variant={store.availability === "In Stock" ? "success" : "warning"}>
                        {store.availability}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      {store.diff > 0 ? (
                        <span className="text-red-500 text-xs font-mono">+{fmt(store.diff)}</span>
                      ) : (
                        <span className="text-emerald-600 text-xs font-mono">Best</span>
                      )}
                    </td>
                    <td className="py-3">
                      <button className="bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
                        Buy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {["history", "prediction"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                    tab === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t === "history" ? "Price History" : "Price Prediction"}
                </button>
              ))}
            </div>
            {tab === "history" && (
              <div className="flex gap-1">
                {timeRanges.map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      timeRange === r ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
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
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Lowest", value: fmt(29999), color: "text-emerald-700" },
                  { label: "Highest", value: fmt(34990), color: "text-red-600" },
                  { label: "Average", value: fmt(32200), color: "text-slate-700" },
                  { label: "Current", value: fmt(product.bestPrice), color: "text-indigo-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={priceHistoryData}>
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
                    <ReferenceLine y={32200} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "Avg", position: "right", fontSize: 10, fill: "#94a3b8" }} />
                    <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#priceGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <Info size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">Price predictions are estimates based on historical patterns. Actual prices may vary.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Predicted in 7 days", value: fmt(29500), badge: "Moderate confidence" },
                  { label: "Predicted in 30 days", value: fmt(28499), badge: "High confidence" },
                  { label: "Potential saving", value: fmt(1500), badge: "vs current" },
                ].map(({ label, value, badge }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className="text-base font-bold font-mono text-indigo-700">{value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{badge}</p>
                  </div>
                ))}
              </div>
              <div>
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={predictionData}>
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

        {/* AI Analysis */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Sparkles size={13} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">AI Analysis</h2>
          </div>
          <div className="space-y-2.5">
            {[
              { type: "check", text: "Current price is 12% below the 90-day average" },
              { type: "check", text: "Similar products in this category are priced higher on average" },
              { type: "check", text: "Price has dropped 14% in the last 30 days" },
              { type: "warn", text: "Price volatility is moderate — sudden increases are possible" },
              { type: "check", text: "This is one of the lowest prices recorded in the last 6 months" },
            ].map(({ type, text }) => (
              <div key={text} className={`flex items-start gap-2.5 p-3 rounded-xl ${
                type === "check" ? "bg-emerald-50" : "bg-amber-50"
              }`}>
                {type === "check"
                  ? <CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                  : <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                }
                <p className={`text-sm ${type === "check" ? "text-emerald-800" : "text-amber-800"}`}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Smart Alternatives */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Smart Alternatives</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {products.filter((p) => p.id !== product.id).slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>

        {/* Price Alert Setup */}
        <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={18} className="text-indigo-300" />
            <h2 className="text-lg font-bold text-white">Set a Price Alert</h2>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            Get notified the moment the price drops to your target
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Target Price (₹)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                  placeholder="e.g. 27000"
                  className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-slate-500 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {["27000", "25000", "23000"].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAlertPrice(v)}
                    className="text-xs text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 px-2 py-1 rounded-full transition-colors"
                  >
                    ₹{Number(v).toLocaleString("en-IN")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Notify via</label>
              <div className="flex gap-2 flex-wrap">
                {["Email", "In-app", "Push"].map((ch) => (
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
