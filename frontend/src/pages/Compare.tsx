import { useState, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router"
import { ExternalLink, Loader2, Search, X, Plus, Sparkles, CheckCircle2 } from "lucide-react"
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
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const idsParam = params.get("ids")

  const [compareProducts, setCompareProducts] = useState<Product[]>([])
  const [catalog, setCatalog] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch all products once for the add modal
  useEffect(() => {
    api.getProducts({ limit: 150 })
      .then((res) => setCatalog(res.items || []))
      .catch(console.error)
  }, [])

  useEffect(() => {
    let isMounted = true
    async function loadCompare() {
      try {
        setLoading(true)
        if (idsParam) {
          const ids = idsParam.split(",").filter(Boolean)
          if (ids.length > 0) {
            try {
              const res = await api.compareProducts(ids)
              if (isMounted && res.products && res.products.length > 0) {
                setCompareProducts(res.products as Product[])
                return
              }
            } catch (err) {
              console.warn("api.compareProducts failed, falling back to direct load:", err)
              // Fallback: load specific products directly
              const loaded: Product[] = []
              for (const id of ids.slice(0, 3)) {
                try {
                  const pRes = await api.getProduct(id)
                  if (pRes) {
                    loaded.push({
                      id: pRes.id,
                      name: pRes.name,
                      brand: pRes.brand,
                      image: pRes.image,
                      rating: pRes.rating,
                      reviews: pRes.reviews,
                      specs: pRes.specs,
                      bestPrice: pRes.bestPrice,
                      mrp: pRes.mrp,
                      discount: pRes.discount,
                      bestStore: pRes.bestStore,
                      stores: pRes.stores,
                      trend: pRes.trend,
                      category: pRes.category,
                      aiVerdict: pRes.aiVerdict,
                      verdictColor: pRes.verdictColor,
                      priceHistory: pRes.priceHistory,
                    })
                  }
                } catch (e) {
                  console.error(e)
                }
              }
              if (isMounted && loaded.length > 0) {
                setCompareProducts(loaded)
                return
              }
            }
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

  const removeProduct = (id: string) => {
    const next = compareProducts.filter((p) => p.id !== id)
    setCompareProducts(next)
    const newParams = new URLSearchParams()
    if (next.length > 0) newParams.set("ids", next.map((p) => p.id).join(","))
    setParams(newParams)
  }

  const addProductToCompare = (product: Product) => {
    if (compareProducts.some((p) => p.id === product.id)) return
    if (compareProducts.length >= 4) return
    const next = [...compareProducts, product]
    setCompareProducts(next)
    const newParams = new URLSearchParams()
    newParams.set("ids", next.map((p) => p.id).join(","))
    setParams(newParams)
    setModalOpen(false)
    setSearchQuery("")
  }

  const resolveImage = (p: Product) => {
    if (p.image) {
      const spMatch = p.image.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/)
      if (spMatch) {
        return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-w280-h280/phone.webp`
      }
      return p.image
    }
    const b = (p.brand || "").toLowerCase()
    if (b.includes("apple")) return "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"
    if (b.includes("samsung")) return "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80"
    if (b.includes("oneplus")) return "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"
    if (b.includes("motorola")) return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
    if (b.includes("vivo")) return "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80"
    if (b.includes("realme")) return "https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80"
    if (b.includes("oppo")) return "https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80"
    return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
  }

  const filteredCatalog = catalog.filter((p) => {
    if (compareProducts.some((cp) => cp.id === p.id)) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
          <p className="text-sm text-slate-500">Loading live specs and pricing from Supabase...</p>
        </div>
      </div>
    )
  }

  if (compareProducts.length === 0) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 max-w-[1440px] mx-auto px-6 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 max-w-lg mx-auto shadow-sm">
          <div className="text-5xl mb-4">⚖️</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">No Products Selected</h2>
          <p className="text-slate-500 text-sm mb-6">Choose any smartphones from the catalog to compare prices and specifications.</p>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors cursor-pointer shadow-md shadow-indigo-600/20"
          >
            Pick Smartphones to Compare
          </button>
        </div>
      </div>
    )
  }

  // Grid columns template: 1 label column + N product columns
  const gridStyle = {
    gridTemplateColumns: `minmax(140px, 180px) repeat(${compareProducts.length}, minmax(200px, 1fr))`,
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Compare Smartphones</h1>
            <p className="text-sm text-slate-500">
              Side-by-side spec comparison across {compareProducts.length} devices from live Supabase database
            </p>
          </div>
          <div className="flex gap-2">
            {compareProducts.length < 4 && (
              <button
                onClick={() => setModalOpen(true)}
                className="text-sm bg-indigo-600 text-white hover:bg-indigo-700 font-medium flex items-center gap-1.5 rounded-xl px-4 py-2 cursor-pointer shadow-md shadow-indigo-600/20 transition-all"
              >
                <Plus size={15} /> Add Smartphone
              </button>
            )}
            <button
              onClick={() => navigate("/search")}
              className="text-sm text-slate-700 hover:text-slate-900 font-medium flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-4 py-2 cursor-pointer shadow-2xs"
            >
              <Search size={14} /> Search Catalog
            </button>
          </div>
        </div>

        {/* Scrollable table container */}
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[700px]">
            {/* Product Header Row */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 shadow-sm">
              <div className="grid divide-x divide-slate-100" style={gridStyle}>
                <div className="p-4 bg-slate-50 flex items-center">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Device</p>
                </div>
                {compareProducts.map((p, i) => (
                  <div key={p.id} className="p-4 relative text-center group">
                    {/* Remove button */}
                    <button
                      onClick={() => removeProduct(p.id)}
                      title="Remove from comparison"
                      className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors cursor-pointer"
                    >
                      <X size={15} />
                    </button>

                    <div className="w-24 h-24 mx-auto mb-2 bg-slate-50 rounded-xl p-2 flex items-center justify-center">
                      <img
                        src={resolveImage(p)}
                        alt={p.name}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain rounded-lg group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">{p.brand}</p>
                    <p className="text-xs font-medium text-slate-800 line-clamp-2 mb-2 h-8">{p.name}</p>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className="text-lg font-bold text-slate-900">{fmt(p.bestPrice)}</span>
                      {p.mrp > p.bestPrice && (
                        <span className="text-xs text-slate-400 line-through">{fmt(p.mrp)}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mb-3">Best at {p.bestStore}</p>
                    <button
                      onClick={() => navigate(`/product/${p.id}`)}
                      className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white text-xs font-medium py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
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
                  <div key={label} className="grid divide-x divide-slate-100 border-b border-slate-50 last:border-b-0" style={gridStyle}>
                    <div className="p-3 px-5 bg-slate-50 flex items-center">
                      <p className="text-xs font-medium text-slate-600">{label}</p>
                    </div>
                    {compareProducts.map((p, i) => {
                      const val = (p as unknown as Record<string, unknown>)[key]
                      const isBest = i === bestIdx && compare !== "none"
                      return (
                        <div key={p.id} className={`p-3 text-center flex flex-col justify-center items-center ${isBest ? "bg-emerald-50/60" : ""}`}>
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
                const specLabels = [
                  "Processor / Chipset",
                  "Memory & Storage",
                  "Display",
                  "Battery & Fast Charging",
                  "Rear & Front Cameras",
                  "Connectivity & OS",
                ]
                return (
                  <div key={specIdx} className="grid divide-x divide-slate-100 border-b border-slate-50 last:border-b-0" style={gridStyle}>
                    <div className="p-3 px-5 bg-slate-50 flex items-center">
                      <p className="text-xs font-medium text-slate-600">{specLabels[specIdx]}</p>
                    </div>
                    {compareProducts.map((p) => (
                      <div key={p.id} className="p-3 text-center flex items-center justify-center">
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
      </div>

      {/* Add Device Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Add Smartphone to Compare</h3>
                <p className="text-xs text-slate-500">Pick from {catalog.length} smartphones in database</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Search size={16} className="text-slate-400 shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search brand (OnePlus, Samsung, Apple, Motorola...)"
                  className="w-full text-sm outline-none bg-transparent"
                  autoFocus
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredCatalog.slice(0, 20).map((p) => (
                <div
                  key={p.id}
                  onClick={() => addProductToCompare(p)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-lg p-1 shrink-0 flex items-center justify-center">
                      <img src={resolveImage(p)} alt={p.name} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-indigo-600">{p.brand}</p>
                      <p className="text-xs font-medium text-slate-800 line-clamp-1">{p.name}</p>
                      <p className="text-xs font-bold text-slate-900">{fmt(p.bestPrice)}</p>
                    </div>
                  </div>
                  <button className="bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    Add +
                  </button>
                </div>
              ))}
              {filteredCatalog.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-400">
                  No matching phones found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
