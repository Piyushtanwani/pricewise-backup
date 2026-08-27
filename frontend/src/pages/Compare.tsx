import { useState } from "react"
import { CheckCircle, Minus, Sparkles, ExternalLink, TrendingDown } from "lucide-react"
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from "recharts"
import { products, priceHistoryData } from "../data/mockData"
import Badge from "../components/ui/Badge"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const specs = [
  { label: "Best Price", key: "bestPrice", fmt: (v: number) => fmt(v), compare: "low" },
  { label: "MRP", key: "mrp", fmt: (v: number) => fmt(v), compare: "low" },
  { label: "Discount", key: "discount", fmt: (v: number) => `${v}%`, compare: "high" },
  { label: "Rating", key: "rating", fmt: (v: number) => `${v} / 5`, compare: "high" },
  { label: "Reviews", key: "reviews", fmt: (v: number) => v.toLocaleString("en-IN"), compare: "high" },
  { label: "Best Store", key: "bestStore", fmt: (v: string) => v, compare: "none" },
]

const techSpecs = [
  { label: "Processor", values: ["A18 Pro (Apple)", "Snapdragon 8 Elite", "Tensor G4"] },
  { label: "RAM", values: ["8 GB", "12 GB", "12 GB"] },
  { label: "Storage", values: ["256 GB", "256 GB", "128 GB"] },
  { label: "Display", values: ['6.9" OLED 120Hz', '6.9" AMOLED 120Hz', '6.3" OLED 120Hz'] },
  { label: "Camera", values: ["48 MP Main", "200 MP Main", "50 MP Main"] },
  { label: "Battery", values: ["4685 mAh", "5000 mAh", "4700 mAh"] },
  { label: "Weight", values: ["227 g", "218 g", "198 g"] },
  { label: "Warranty", values: ["1 Year", "1 Year", "3 Years (OS)"] },
]

const compareProducts = [products[1], products[3], products[5]]

export default function Compare() {
  const [aiExpanded, setAiExpanded] = useState(false)

  const getBest = (key: string, mode: string) => {
    if (mode === "none") return -1
    const vals = compareProducts.map((p) => (p as Record<string, unknown>)[key] as number)
    return mode === "low" ? vals.indexOf(Math.min(...vals)) : vals.indexOf(Math.max(...vals))
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Compare Products</h1>
          <p className="text-sm text-slate-500">Side-by-side comparison with AI insights</p>
        </div>

        {/* Product Header Row */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
          <div className="grid grid-cols-4 divide-x divide-slate-100">
            <div className="p-4 bg-slate-50">
              <p className="text-xs text-slate-500 font-medium">Product</p>
            </div>
            {compareProducts.map((p, i) => (
              <div key={p.id} className="p-4 relative">
                {i === 0 && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="primary">Best Overall</Badge>
                  </div>
                )}
                <img src={p.image} alt={p.name} className="w-16 h-16 object-cover rounded-xl mb-2 mx-auto" />
                <p className="text-xs font-semibold text-indigo-600 text-center">{p.brand}</p>
                <p className="text-xs font-medium text-slate-800 text-center line-clamp-2 mb-2">{p.name}</p>
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-lg font-bold text-slate-900">{fmt(p.bestPrice)}</span>
                </div>
                <p className="text-xs text-slate-400 text-center mb-2">Best at {p.bestStore}</p>
                <button className="w-full bg-indigo-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1">
                  View Deal <ExternalLink size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Specs */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Pricing</h3>
          </div>
          {specs.map(({ label, key, fmt: fmtFn, compare }) => {
            const bestIdx = getBest(key, compare)
            return (
              <div key={label} className="grid grid-cols-4 divide-x divide-slate-50 border-b border-slate-50 last:border-b-0">
                <div className="p-3 px-5 bg-slate-50">
                  <p className="text-xs font-medium text-slate-600">{label}</p>
                </div>
                {compareProducts.map((p, i) => {
                  const val = (p as Record<string, unknown>)[key]
                  const isBest = i === bestIdx
                  return (
                    <div key={p.id} className={`p-3 text-center ${isBest ? "bg-emerald-50" : ""}`}>
                      <p className={`text-sm font-semibold ${isBest ? "text-emerald-700" : "text-slate-700"} font-mono`}>
                        {fmtFn(val as never)}
                      </p>
                      {isBest && <p className="text-xs text-emerald-600">Best</p>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Technical Specs */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Technical Specifications</h3>
          </div>
          {techSpecs.map(({ label, values }) => (
            <div key={label} className="grid grid-cols-4 divide-x divide-slate-50 border-b border-slate-50 last:border-b-0">
              <div className="p-3 px-5 bg-slate-50">
                <p className="text-xs font-medium text-slate-600">{label}</p>
              </div>
              {values.map((v, i) => (
                <div key={i} className="p-3 text-center">
                  <p className="text-xs text-slate-700">{v}</p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Mini price charts */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Price Intelligence — 3 Month History</h3>
          <div className="grid grid-cols-3 gap-4">
            {compareProducts.map((p) => (
              <div key={p.id}>
                <p className="text-xs font-medium text-slate-700 mb-1">{p.brand} {p.category}</p>
                <div>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={priceHistoryData}>
                      <defs>
                        <linearGradient id={`grad-${p.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="price" stroke="#4f46e5" fill={`url(#grad-${p.id})`} strokeWidth={1.5} dot={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 8 }}
                        formatter={(v) => [typeof v === "number" ? fmt(v) : String(v)]}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-emerald-600 font-mono">L: {fmt(29999)}</span>
                  <span className="text-xs text-red-500 font-mono">H: {fmt(p.mrp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Summary */}
        <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Sparkles size={13} className="text-white" />
            </div>
            <h2 className="text-base font-bold text-slate-900">AI Comparison Summary</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Best Overall", product: compareProducts[0], badge: "primary" },
              { label: "Best Value", product: compareProducts[1], badge: "success" },
              { label: "Best Camera", product: compareProducts[1], badge: "info" },
              { label: "Lowest Price", product: compareProducts[2], badge: "warning" },
            ].map(({ label, product: p, badge }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover mx-auto mb-1" />
                <p className="text-xs font-semibold text-slate-800">{p.brand}</p>
                <Badge variant={badge as "primary" | "success" | "info" | "warning"} className="mt-1">{label}</Badge>
              </div>
            ))}
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-sm text-indigo-800 leading-relaxed">
              <strong>Based on price, performance, specifications, and historical pricing:</strong> The iPhone 16 Pro Max offers the strongest overall premium experience with superior software support and ecosystem integration. The Samsung Galaxy S25 Ultra wins on camera hardware (200MP) and battery life. The Google Pixel 9 Pro offers the best value under ₹90,000, with 7 years of guaranteed OS updates — making it the most future-proof choice at this price point.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
