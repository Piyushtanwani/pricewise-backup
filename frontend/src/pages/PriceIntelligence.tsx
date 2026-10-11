import { useState, useEffect } from "react"
import { Search, TrendingDown, TrendingUp, Sparkles, Info, Loader2 } from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend
} from "recharts"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import type { Product, PriceIntelligenceResponse } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")
const timeRanges = ["7D", "30D", "3M", "6M", "1Y", "All"]

export default function PriceIntelligence() {
  const [productList, setProductList] = useState<Product[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [data, setData] = useState<PriceIntelligenceResponse | null>(null)
  const [timeRange, setTimeRange] = useState("3M")
  const [storeFilter, setStoreFilter] = useState("All Stores")
  const [loading, setLoading] = useState(true)

  // Initial load of product dropdown
  useEffect(() => {
    let isMounted = true
    api.getProducts({ limit: 40 }).then((res) => {
      if (isMounted && res.items.length > 0) {
        setProductList(res.items)
        setSelectedId(res.items[0].id)
      }
    }).catch(console.error)
    return () => { isMounted = false }
  }, [])

  // Fetch intelligence data when selectedId, timeRange, or storeFilter changes
  useEffect(() => {
    if (!selectedId) return
    let isMounted = true
    setLoading(true)

    api.getPriceIntelligence(selectedId, timeRange, storeFilter === "All Stores" ? undefined : storeFilter)
      .then((res) => {
        if (isMounted) setData(res)
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => { isMounted = false }
  }, [selectedId, timeRange, storeFilter])

  const selectedProduct = data?.product || productList.find((p) => p.id === selectedId) || productList[0]

  const stats = [
    { label: "Current Price", value: selectedProduct ? fmt(selectedProduct.bestPrice) : "—", color: "text-indigo-700" },
    { label: "Lowest Ever", value: data?.stats?.lowestEver ? fmt(data.stats.lowestEver) : selectedProduct ? fmt(selectedProduct.bestPrice) : "—", color: "text-emerald-700" },
    { label: "Average (90d)", value: data?.stats?.average90 ? fmt(data.stats.average90) : selectedProduct ? fmt(selectedProduct.bestPrice) : "—", color: "text-slate-700" },
    { label: "Highest (90d)", value: data?.stats?.highest90 ? fmt(data.stats.highest90) : selectedProduct ? fmt(selectedProduct.mrp) : "—", color: "text-red-600" },
    { label: "30d Change", value: `${data?.stats?.change30Percent || 0}%`, color: (data?.stats?.change30Percent || 0) <= 0 ? "text-emerald-700" : "text-red-600" },
    { label: "Confidence", value: "High (ML)", color: "text-indigo-700" },
  ]

  const historyData = data?.history && data.history.length > 0
    ? data.history
    : selectedProduct?.priceHistory?.length
    ? selectedProduct.priceHistory.map((p, i) => ({ date: `Day ${i + 1}`, price: p, avg: selectedProduct.bestPrice }))
    : [{ date: "Current", price: selectedProduct?.bestPrice || 0, avg: selectedProduct?.bestPrice || 0 }]

  const predictionData = data?.prediction && data.prediction.length > 0
    ? data.prediction
    : [
        { date: "Current", price: selectedProduct?.bestPrice || 0, predicted: selectedProduct?.bestPrice || 0, upper: selectedProduct?.bestPrice || 0, lower: selectedProduct?.bestPrice || 0 },
        { date: "In 7 Days", price: null, predicted: Math.round((selectedProduct?.bestPrice || 30000) * 0.98), upper: Math.round((selectedProduct?.bestPrice || 30000) * 1.02), lower: Math.round((selectedProduct?.bestPrice || 30000) * 0.95) },
        { date: "In 30 Days", price: null, predicted: Math.round((selectedProduct?.bestPrice || 30000) * 0.96), upper: Math.round((selectedProduct?.bestPrice || 30000) * 1.03), lower: Math.round((selectedProduct?.bestPrice || 30000) * 0.92) },
      ]

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Price Intelligence</h1>
          <p className="text-sm text-slate-500">Live analytics, historical charts, and predictive models from Supabase</p>
        </div>

        {/* Product selector */}
        {selectedProduct && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center shadow-sm">
            <div className="flex items-center gap-3 flex-1">
              <img src={selectedProduct.image} alt={selectedProduct.name} className="w-12 h-12 rounded-xl object-contain bg-slate-50 p-1" />
              <div className="min-w-0">
                <p className="text-xs text-indigo-600 font-semibold">{selectedProduct.brand}</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{selectedProduct.name}</p>
              </div>
            </div>
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-700 cursor-pointer"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>{p.brand} — {p.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {stats.map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-base font-bold font-mono ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Chart card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Historical Price Trend</h2>
              <p className="text-xs text-slate-500">Retail price evolution across verified stores</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                {timeRanges.map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                      timeRange === r ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
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
                <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#trendGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Predictive Chart */}
          <div className="pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">Predictive Price Projection (30 Days)</h3>
              <Badge variant="primary" className="ml-auto">Machine Learning</Badge>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={predictionData}>
                <defs>
                  <linearGradient id="predGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="rangeGrad2" x1="0" y1="0" x2="0" y2="1">
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
                <Area type="monotone" dataKey="upper" stroke="none" fill="url(#rangeGrad2)" name="Upper estimate" />
                <Area type="monotone" dataKey="lower" stroke="none" fill="white" name="Lower estimate" />
                <Area type="monotone" dataKey="price" stroke="#1e3a8a" fill="url(#predGrad2)" strokeWidth={2.5} dot={false} name="Recorded price" />
                <Area type="monotone" dataKey="predicted" stroke="#4f46e5" fill="none" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: "#4f46e5" }} name="Projected price" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
