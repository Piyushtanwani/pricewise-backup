import { useState } from "react"
import { Search, TrendingDown, TrendingUp, Sparkles, Info } from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend
} from "recharts"
import { priceHistoryData, predictionData, products } from "../data/mockData"
import Badge from "../components/ui/Badge"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")
const timeRanges = ["7D", "30D", "3M", "6M", "1Y", "All"]

export default function PriceIntelligence() {
  const [selectedProduct, setSelectedProduct] = useState(products[0])
  const [timeRange, setTimeRange] = useState("3M")
  const [storeFilter, setStoreFilter] = useState("All Stores")

  const stats = [
    { label: "Current Price", value: fmt(selectedProduct.bestPrice), trend: "down", color: "text-indigo-700" },
    { label: "Lowest Ever", value: fmt(selectedProduct.bestPrice), trend: "down", color: "text-emerald-700" },
    { label: "Average (90d)", value: fmt(32200), trend: null, color: "text-slate-700" },
    { label: "Highest (90d)", value: fmt(selectedProduct.mrp), trend: "up", color: "text-red-600" },
    { label: "30d Change", value: "-14.3%", trend: "down", color: "text-emerald-700" },
    { label: "90d Change", value: "-16.8%", trend: "down", color: "text-emerald-700" },
  ]

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Price Intelligence</h1>
          <p className="text-sm text-slate-500">Deep price analytics, trends, and AI-powered predictions</p>
        </div>

        {/* Product selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-3 flex-1">
            <img src={selectedProduct.image} alt={selectedProduct.name} className="w-12 h-12 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="text-xs text-indigo-600 font-semibold">{selectedProduct.brand}</p>
              <p className="text-sm font-semibold text-slate-800 truncate">{selectedProduct.name}</p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-700 appearance-none"
              onChange={(e) => setSelectedProduct(products.find((p) => p.id === e.target.value) || products[0])}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.brand} — {p.name.slice(0, 30)}...</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {stats.map(({ label, value, trend, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <div className="flex items-center gap-1">
                <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
                {trend === "down" && <TrendingDown size={12} className="text-emerald-600" />}
                {trend === "up" && <TrendingUp size={12} className="text-red-500" />}
              </div>
            </div>
          ))}
        </div>

        {/* Main chart */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900 flex-1">Price History</h2>
            <div className="flex items-center gap-2">
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none text-slate-600"
              >
                {["All Stores", "Amazon", "Flipkart", "Croma"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
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
            </div>
          </div>

          <div>
            <ResponsiveContainer width="100%" height={288}>
              <AreaChart data={priceHistoryData}>
                <defs>
                  <linearGradient id="piHistGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="piAvgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={45} />
                <Tooltip
                  contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }}
                  formatter={(v, name) => [typeof v === "number" ? fmt(v) : String(v), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={32200} stroke="#94a3b8" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="avg" stroke="#94a3b8" fill="url(#piAvgGrad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Average" />
                <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#piHistGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} name="Price" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trend cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {[
            { label: "vs Average", value: "-8.4%", desc: "12% below 90-day average", icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Volatility", value: "Moderate", desc: "Price changes ~3x per month", icon: Info, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
            { label: "Record Low", value: fmt(29999), desc: "Set 2 days ago", icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Best Time to Buy", value: "Now", desc: "Historically strong buying signal", icon: Sparkles, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
          ].map(({ label, value, desc, icon: Icon, color, bg }) => (
            <div key={label} className={`bg-white rounded-xl border p-4 ${bg}`}>
              <Icon size={15} className={`${color} mb-2`} />
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-base font-bold font-mono ${color} mb-0.5`}>{value}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>

        {/* Prediction chart */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900">Future Price Prediction</h2>
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
              <Info size={12} className="text-amber-600" />
              <span className="text-xs text-amber-700">Estimates only — actual prices may vary</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "7 Days", price: fmt(29500), confidence: "Moderate", change: "-1.7%" },
              { label: "30 Days", price: fmt(28499), confidence: "High", change: "-5.0%" },
              { label: "60 Days", price: fmt(27800), confidence: "Low", change: "-7.3%" },
            ].map(({ label, price, confidence, change }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-base font-bold font-mono text-indigo-700">{price}</p>
                <p className="text-sm text-emerald-600 font-medium">{change}</p>
                <Badge variant={confidence === "High" ? "success" : confidence === "Moderate" ? "warning" : "neutral"} className="mt-1">
                  {confidence} confidence
                </Badge>
              </div>
            ))}
          </div>

          <div>
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={predictionData}>
                <defs>
                  <linearGradient id="piPredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
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
                <Area type="monotone" dataKey="upper" stroke="none" fill="#e0e7ff" name="Confidence range (upper)" />
                <Area type="monotone" dataKey="lower" stroke="none" fill="white" name="Confidence range (lower)" />
                <Area type="monotone" dataKey="price" stroke="#1e3a8a" fill="url(#piPredGrad)" strokeWidth={2.5} dot={false} name="Actual" />
                <Area type="monotone" dataKey="predicted" stroke="#4f46e5" fill="none" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: "#4f46e5" }} name="Predicted" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insight */}
        <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Sparkles size={13} className="text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">PriceWise Insight</h2>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            Prices have shown a consistent <strong>downward trend over the last 6 weeks</strong>, dropping from ₹34,990 to ₹29,999. Based on historical behavior around this product's lifecycle and category patterns, we predict a further 5–8% decline over the next 30 days. However, promotional seasons (Republic Day, Valentine's Day) could cause brief spikes. <strong>Current confidence: High</strong> — this is one of the strongest buy signals we've seen for this product.
          </p>
          <div className="mt-3 flex gap-2">
            <Badge variant="success">Good time to buy</Badge>
            <Badge variant="info">High confidence</Badge>
            <Badge variant="neutral">Updated 2 hrs ago</Badge>
          </div>
        </div>
      </div>
    </div>
  )
}
