import { useState, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router"
import { CheckCircle, Minus, Sparkles, ExternalLink, Loader2, Search } from "lucide-react"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import type { Product } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const specs = [
  { label: "Best Price", key: "bestPrice", fmt: (v: number) => fmt(v), compare: "low" },
  { label: "Estimated MRP", key: "mrp", fmt: (v: number) => fmt(v), compare: "low" },
  { label: "Discount", key: "discount", fmt: (v: number) => `${v}%`, compare: "high" },
  { label: "Rating", key: "rating", fmt: (v: number) => `${v} / 5`, compare: "high" },
  { label: "Best Store", key: "bestStore", fmt: (v: string) => v, compare: "none" },
  { label: "AI Verdict", key: "aiVerdict", fmt: (v: string) => v, compare: "none" },
]

export default function Compare() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const idsParam = params.get("ids")

  const [compareProducts, setCompareProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    async function loadCompare() {
      try {
        setLoading(true)
        if (idsParam) {
          const ids = idsParam.split(",").filter(Boolean)
          const res = await api.compareProducts(ids)
          if (isMounted && res.products && res.products.length > 0) {
            setCompareProducts(res.products as Product[])
            return
          }
        }

        // Default: take top 3 phones across different brands from DB
        const res = await api.getProducts({ limit: 3, sort: "relevance" })
        if (isMounted) {
          setCompareProducts(res.items || [])
        }
      } catch (err) {
        console.error("Failed to load products for comparison:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadCompare()
    return () => { isMounted = false }
  }, [idsParam])

  const getBest = (key: string, mode: string) => {
    if (mode === "none" || compareProducts.length === 0) return -1
    const vals = compareProducts.map((p) => (p as unknown as Record<string, unknown>)[key] as number)
    return mode === "low" ? vals.indexOf(Math.min(...vals)) : vals.indexOf(Math.max(...vals))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
          <p className="text-sm text-slate-500">Loading product specs for comparison...</p>
        </div>
      </div>
    )
  }

  if (compareProducts.length === 0) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 max-w-[1440px] mx-auto px-6 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 max-w-lg mx-auto shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-2">No Products Selected</h2>
          <p className="text-slate-500 text-sm mb-6">Select smartphones from the search page to compare side-by-side.</p>
          <button
            onClick={() => navigate("/search")}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Browse Smartphones
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Compare Smartphones</h1>
            <p className="text-sm text-slate-500">Side-by-side spec comparison from live Supabase database</p>
          </div>
          <button
            onClick={() => navigate("/search")}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-4 py-2 cursor-pointer shadow-2xs"
          >
            <Search size={14} /> Add / Change Phones
          </button>
        </div>

        {/* Product Header Row */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 shadow-sm">
          <div className="grid grid-cols-4 divide-x divide-slate-100">
            <div className="p-4 bg-slate-50 flex items-center">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Product</p>
            </div>
            {compareProducts.map((p, i) => (
              <div key={p.id} className="p-4 relative text-center">
                {i === 0 && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="primary">Top Pick</Badge>
                  </div>
                )}
                <div className="w-20 h-20 mx-auto mb-2 bg-slate-50 rounded-xl p-2 flex items-center justify-center">
                  <img src={p.image} alt={p.name} className="max-h-full max-w-full object-contain rounded-lg" />
                </div>
                <p className="text-xs font-semibold text-indigo-600">{p.brand}</p>
                <p className="text-xs font-medium text-slate-800 line-clamp-2 mb-2 h-8">{p.name}</p>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className="text-lg font-bold text-slate-900">{fmt(p.bestPrice)}</span>
                </div>
                <p className="text-xs text-slate-400 mb-2">at {p.bestStore}</p>
                <button
                  onClick={() => navigate(`/product/${p.id}`)}
                  className="w-full bg-indigo-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  View Details <ExternalLink size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Specs */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-700">Pricing & Value</h3>
          </div>
          {specs.map(({ label, key, fmt: fmtFn, compare }) => {
            const bestIdx = getBest(key, compare)
            return (
              <div key={label} className="grid grid-cols-4 divide-x divide-slate-50 border-b border-slate-50 last:border-b-0">
                <div className="p-3 px-5 bg-slate-50 flex items-center">
                  <p className="text-xs font-medium text-slate-600">{label}</p>
                </div>
                {compareProducts.map((p, i) => {
                  const val = (p as unknown as Record<string, unknown>)[key]
                  const isBest = i === bestIdx
                  return (
                    <div key={p.id} className={`p-3 text-center ${isBest ? "bg-emerald-50/60" : ""}`}>
                      <p className={`text-sm font-semibold ${isBest ? "text-emerald-700" : "text-slate-700"} font-mono`}>
                        {val !== undefined && val !== null ? fmtFn(val as never) : "—"}
                      </p>
                      {isBest && <p className="text-[10px] text-emerald-600 font-bold uppercase mt-0.5">Best</p>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Technical Highlights */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-700">Technical Highlights</h3>
          </div>
          {[0, 1, 2, 3, 4, 5].map((specIdx) => {
            const specLabels = ["Processor / Chipset", "Memory & Storage", "Display", "Battery & Charging", "Camera Setup", "Connectivity & OS"]
            return (
              <div key={specIdx} className="grid grid-cols-4 divide-x divide-slate-50 border-b border-slate-50 last:border-b-0">
                <div className="p-3 px-5 bg-slate-50 flex items-center">
                  <p className="text-xs font-medium text-slate-600">{specLabels[specIdx]}</p>
                </div>
                {compareProducts.map((p) => (
                  <div key={p.id} className="p-3 text-center">
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {p.specs?.[specIdx] || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
