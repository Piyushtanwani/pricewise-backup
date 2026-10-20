import { useState, useEffect, useRef } from "react"
import { useSearchParams, useNavigate } from "react-router"
import { ExternalLink, Loader2, Search, X, Plus, Trash2 } from "lucide-react"
import { api } from "../services/api"
import { notifyCompareChange, COMPARE_STORAGE_KEY, COMPARE_CLEARED_KEY } from "../hooks/useCompareAction"
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

export interface TechSpecRow {
  key: string
  label: string
  getValue: (p: Product) => string
}

// Safely inspect techSpecs dictionary if present
const findInTechSpecs = (p: Product, pattern: RegExp): string | null => {
  const ts = (p as unknown as { techSpecs?: Record<string, string> }).techSpecs
  if (!ts || typeof ts !== "object") return null
  for (const [k, v] of Object.entries(ts)) {
    if (pattern.test(k) && typeof v === "string" && v.trim()) {
      return v.trim()
    }
  }
  return null
}

export const techSpecRows: TechSpecRow[] = [
  {
    key: "processor",
    label: "Processor / Chipset",
    getValue: (p: Product) => {
      // 1. Check techSpecs object
      const fromTech = findInTechSpecs(p, /processor|chipset|cpu/i)
      if (fromTech) return fromTech

      // 2. Search specs array for processor details
      if (Array.isArray(p.specs)) {
        const found = p.specs.find((s) =>
          typeof s === "string" &&
          (/processor|octa core|hexa core|quad core|\bghz\b|snapdragon|dimensity|bionic|helio|exynos|tensor|unisoc/i.test(s))
        )
        if (found) return found

        // 3. Fallback to index 1 if not network/SIM
        if (p.specs[1] && !/sim|5g|wifi|wi-fi/i.test(p.specs[1])) {
          return p.specs[1]
        }
      }

      return "—"
    },
  },
  {
    key: "display",
    label: "Display",
    getValue: (p: Product) => {
      // 1. Check techSpecs object
      const fromTech = findInTechSpecs(p, /display|screen|resolution/i)
      if (fromTech) return fromTech

      // 2. Search specs array for display specs
      if (Array.isArray(p.specs)) {
        const found = p.specs.find((s) =>
          typeof s === "string" &&
          (/display|inches|\bamoled\b|\boled\b|\blcd\b|\bhz\b|\bpx\b|punch hole|notch|refresh rate/i.test(s))
        )
        if (found) return found

        // 3. Fallback to index 4
        if (p.specs[4] && /inches|display|px|hz/i.test(p.specs[4])) {
          return p.specs[4]
        }
      }

      return "—"
    },
  },
  {
    key: "memory",
    label: "Memory & Storage",
    getValue: (p: Product) => {
      // 1. Check techSpecs object
      const ramTech = findInTechSpecs(p, /\bram\b|memory/i)
      const storageTech = findInTechSpecs(p, /\bstorage\b|\brom\b|inbuilt/i)
      if (ramTech && storageTech && ramTech !== storageTech) {
        return `${ramTech} • ${storageTech}`
      }
      if (ramTech) return ramTech
      if (storageTech) return storageTech

      // 2. Search specs array
      if (Array.isArray(p.specs)) {
        const found = p.specs.find((s) =>
          typeof s === "string" && (/\bram\b|inbuilt|\brom\b|\bstorage\b/i.test(s))
        )
        if (found) return found

        // 3. Fallback to index 2
        if (p.specs[2] && /ram|inbuilt|gb/i.test(p.specs[2])) {
          return p.specs[2]
        }
      }

      return "—"
    },
  },
  {
    key: "battery",
    label: "Battery & Fast Charging",
    getValue: (p: Product) => {
      // 1. Check techSpecs object
      const fromTech = findInTechSpecs(p, /battery|charging/i)
      if (fromTech) return fromTech

      // 2. Search specs array
      if (Array.isArray(p.specs)) {
        const found = p.specs.find((s) =>
          typeof s === "string" && (/\bmah\b|battery|charging|\bwatts?\b|\bw\b/i.test(s))
        )
        if (found) return found

        // 3. Fallback to index 3
        if (p.specs[3] && /mah|battery/i.test(p.specs[3])) {
          return p.specs[3]
        }
      }

      return "—"
    },
  },
  {
    key: "camera",
    label: "Rear & Front Cameras",
    getValue: (p: Product) => {
      // 1. Check techSpecs object
      const rearTech = findInTechSpecs(p, /rear|primary camera/i)
      const frontTech = findInTechSpecs(p, /front|selfie/i)
      if (rearTech && frontTech) {
        return `${rearTech} (Rear) • ${frontTech} (Front)`
      }
      const generalCam = findInTechSpecs(p, /camera/i)
      if (generalCam) return generalCam

      // 2. Search specs array
      if (Array.isArray(p.specs)) {
        const found = p.specs.find((s) =>
          typeof s === "string" && (/camera|\bmp\b|dual rear|triple rear|quad rear/i.test(s))
        )
        if (found) return found

        // 3. Fallback to index 5
        if (p.specs[5] && /mp|camera/i.test(p.specs[5])) {
          return p.specs[5]
        }
      }

      return "—"
    },
  },
  {
    key: "connectivity",
    label: "Connectivity & OS",
    getValue: (p: Product) => {
      // 1. Check techSpecs object
      const osTech = findInTechSpecs(p, /\bos\b|operating/i)
      const netTech = findInTechSpecs(p, /connectivity|network|sim/i)

      let netSpec = ""
      let osSpec = ""

      if (Array.isArray(p.specs)) {
        netSpec = p.specs.find((s) =>
          typeof s === "string" && (/\b(5g|4g|volte|wi-fi|wifi|sim|dual sim)\b/i.test(s))
        ) || ""
        osSpec = p.specs.find((s) =>
          typeof s === "string" && (/\b(android|ios|oxygenos|hyperos|one ui|v\d+)\b/i.test(s))
        ) || ""
      }

      const netPart = netTech || netSpec || (p.specs && /sim|5g/i.test(p.specs[0]) ? p.specs[0] : "")
      const osPart = osTech || osSpec || (p.specs && /android|ios/i.test(p.specs[7]) ? p.specs[7] : "")

      const parts = [netPart, osPart].filter(Boolean)
      const unique = Array.from(new Set(parts))
      return unique.length > 0 ? unique.join(" • ") : "—"
    },
  },
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

  // Keep track of what we loaded to prevent re-fetching when user removes a product or clears all
  const lastLoadedIdsRef = useRef<string | null>(null)
  const userClearedRef = useRef<boolean>(false)

  // Fetch all products once for the search/add modal
  useEffect(() => {
    api.getProducts({ limit: 150 })
      .then((res) => setCatalog(res.items || []))
      .catch(console.error)
  }, [])

  useEffect(() => {
    // If the URL param matches what we already have in state, don't re-trigger
    if (lastLoadedIdsRef.current === idsParam && (compareProducts.length > 0 || userClearedRef.current)) {
      setLoading(false)
      return
    }

    // Explicit in-session empty query state: ?ids= or cleared during active session
    if (idsParam === "" || (idsParam === null && userClearedRef.current)) {
      setCompareProducts([])
      setLoading(false)
      lastLoadedIdsRef.current = idsParam
      return
    }

    lastLoadedIdsRef.current = idsParam
    let isMounted = true

    async function loadCompare() {
      try {
        setLoading(true)

        // 1. If explicit IDs provided in URL query parameters
        if (idsParam !== null && idsParam !== undefined) {
          const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean)

          if (ids.length > 0) {
            try {
              const res = await api.compareProducts(ids)
              if (isMounted && res.products && res.products.length > 0) {
                setCompareProducts(res.products as Product[])
                userClearedRef.current = false
                try {
                  localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(ids))
                  localStorage.removeItem(COMPARE_CLEARED_KEY)
                  notifyCompareChange()
                } catch {}
                setLoading(false)
                return
              }
            } catch (err) {
              console.warn("api.compareProducts failed, falling back to direct load:", err)
              if (catalog.length > 0) {
                const matched = catalog.filter((p) => ids.includes(p.id))
                if (matched.length > 0) {
                  setCompareProducts(matched)
                  userClearedRef.current = false
                  try {
                    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(ids))
                    localStorage.removeItem(COMPARE_CLEARED_KEY)
                    notifyCompareChange()
                  } catch {}
                  setLoading(false)
                  return
                }
              }
            }
          } else {
            // ids parameter was empty string (e.g. ?ids=)
            if (isMounted) {
              setCompareProducts([])
              userClearedRef.current = true
              setLoading(false)
            }
            return
          }
        }

        // 2. Check localStorage if no URL param (e.g. navigation from Navbar or other page)
        try {
          if (userClearedRef.current) {
            if (isMounted) {
              setCompareProducts([])
              setLoading(false)
            }
            return
          }

          const savedJson = localStorage.getItem(COMPARE_STORAGE_KEY)
          const isCleared = localStorage.getItem(COMPARE_CLEARED_KEY) === "true"
          if (savedJson && !isCleared) {
            const savedIds: string[] = JSON.parse(savedJson)
            if (Array.isArray(savedIds) && savedIds.length > 0) {
              const res = await api.compareProducts(savedIds)
              if (isMounted && res.products && res.products.length > 0) {
                setCompareProducts(res.products as Product[])
                userClearedRef.current = false
                const newParams = new URLSearchParams()
                newParams.set("ids", savedIds.join(","))
                setParams(newParams, { replace: true })
                setLoading(false)
                return
              }
            }
          }
        } catch (e) {
          console.warn("localStorage check failed:", e)
        }

        // 3. Fallback: completely empty (NO auto-injected phones!)
        if (isMounted) {
          setCompareProducts([])
          setLoading(false)
        }
      } catch (err) {
        console.error("Failed to load products for comparison:", err)
        if (isMounted) {
          setCompareProducts([])
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadCompare()
    return () => { isMounted = false }
  }, [idsParam, catalog])

  const getBest = (key: string, mode: string) => {
    if (mode === "none" || compareProducts.length === 0) return -1
    const vals = compareProducts.map((p) => (p as unknown as Record<string, unknown>)[key] as number)
    return mode === "low" ? vals.indexOf(Math.min(...vals)) : vals.indexOf(Math.max(...vals))
  }

  // Remove individual smartphone from comparison
  const removeProduct = (id: string) => {
    const next = compareProducts.filter((p) => p.id !== id)
    setCompareProducts(next)

    const newIds = next.map((p) => p.id)
    lastLoadedIdsRef.current = newIds.join(",")

    // Explicitly update localStorage
    try {
      localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(newIds))
      if (next.length === 0) {
        userClearedRef.current = true
        localStorage.setItem(COMPARE_CLEARED_KEY, "true")
      } else {
        localStorage.removeItem(COMPARE_CLEARED_KEY)
      }
      notifyCompareChange()
    } catch (e) {
      console.error("Failed to update localStorage:", e)
    }

    const newParams = new URLSearchParams()
    if (newIds.length > 0) {
      newParams.set("ids", newIds.join(","))
    }
    setParams(newParams, { replace: true })
  }

  // Clear all smartphones from comparison
  const clearAll = () => {
    userClearedRef.current = true
    lastLoadedIdsRef.current = ""
    setCompareProducts([])

    // Explicitly update localStorage to empty array and reset flags
    try {
      localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify([]))
      localStorage.setItem(COMPARE_CLEARED_KEY, "true")
      localStorage.removeItem("pricewise_trending_id")
      localStorage.removeItem("pricewise_trending_removed")
      notifyCompareChange()
    } catch (e) {
      console.error("Failed to clear localStorage:", e)
    }

    setParams(new URLSearchParams(), { replace: true })
  }

  // Add smartphone to comparison
  const addProductToCompare = (product: Product) => {
    if (!product || !product.id) return
    if (compareProducts.some((p) => p.id === product.id)) {
      setModalOpen(false)
      return
    }
    if (compareProducts.length >= 4) {
      setModalOpen(false)
      return
    }

    userClearedRef.current = false
    const next = [...compareProducts, product]
    setCompareProducts(next)
    const newIds = next.map((p) => p.id)
    lastLoadedIdsRef.current = newIds.join(",")

    // Explicitly update localStorage with active comparison
    try {
      localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(newIds))
      localStorage.removeItem(COMPARE_CLEARED_KEY)
      notifyCompareChange()
    } catch (e) {
      console.error("Failed to update localStorage:", e)
    }

    const newParams = new URLSearchParams()
    newParams.set("ids", newIds.join(","))
    setParams(newParams, { replace: true })
    setModalOpen(false)
    setSearchQuery("")
  }

  // Open modal and ensure catalog is fetched
  const handleOpenModal = () => {
    if (catalog.length === 0) {
      api.getProducts({ limit: 150 })
        .then((res) => setCatalog(res.items || []))
        .catch(console.error)
    }
    setSearchQuery("")
    setModalOpen(true)
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
          <p className="text-sm text-slate-500">Loading specs and pricing for comparison...</p>
        </div>
      </div>
    )
  }

  // Column counts: 1 label column + products + (optional add placeholder if < 4)
  const canAddMore = compareProducts.length < 4
  const totalCols = compareProducts.length + (canAddMore ? 1 : 0)
  const gridStyle = {
    gridTemplateColumns: `minmax(140px, 180px) repeat(${totalCols}, minmax(210px, 1fr))`,
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {compareProducts.length === 0 ? (
          /* Empty State View */
          <div className="pt-16 max-w-lg mx-auto text-center">
            <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-sm">
              <div className="text-5xl mb-4">⚖️</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">No Products Selected</h2>
              <p className="text-slate-500 text-sm mb-6">
                Choose any smartphones from the database to compare prices, ratings, and specifications.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenModal}
                  className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors cursor-pointer shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} /> Add Smartphone to Compare
                </button>
                <button
                  type="button"
                  onClick={handleOpenModal}
                  className="w-full sm:w-auto bg-slate-100 text-slate-700 px-5 py-2.5 rounded-xl font-medium hover:bg-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Search size={16} /> Browse Catalog
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Full Comparison Table View */
          <>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">Compare Smartphones</h1>
                <p className="text-sm text-slate-500">
                  Comparing {compareProducts.length} devices side-by-side from live database
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canAddMore && (
                  <button
                    type="button"
                    onClick={handleOpenModal}
                    className="text-sm bg-indigo-600 text-white hover:bg-indigo-700 font-medium flex items-center gap-1.5 rounded-xl px-4 py-2 cursor-pointer shadow-md shadow-indigo-600/20 transition-all"
                  >
                    <Plus size={15} /> Add Smartphone
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-sm text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 font-medium flex items-center gap-1.5 rounded-xl px-3.5 py-2 cursor-pointer transition-all"
                  title="Clear all phones from comparison"
                >
                  <Trash2 size={14} /> Clear All
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/search")}
                  className="text-sm text-slate-700 hover:text-slate-900 font-medium flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-4 py-2 cursor-pointer shadow-2xs"
                >
                  <Search size={14} /> Search Catalog
                </button>
              </div>
            </div>

            {/* Scrollable table container */}
            <div className="overflow-x-auto pb-4">
              <div className="min-w-[720px]">
                {/* Product Header Row */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 shadow-sm">
                  <div className="grid divide-x divide-slate-100" style={gridStyle}>
                    <div className="p-4 bg-slate-50 flex items-center">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Device</p>
                    </div>
                    {compareProducts.map((p, i) => (
                      <div
                        key={p.id}
                        className="p-4 text-center group bg-white transition-all rounded-xl"
                      >
                        {/* Top action row: Device tag + Delete button */}
                        <div className="flex items-center justify-between mb-2 gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Device {i + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeProduct(p.id)}
                            title={`Delete ${p.name} from comparison`}
                            className="text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer font-medium shadow-2xs"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>

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
                          type="button"
                          onClick={() => navigate(`/product/${p.id}`)}
                          className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white text-xs font-medium py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          View Details <ExternalLink size={11} />
                        </button>
                      </div>
                    ))}

                    {/* Add device slot if less than 4 */}
                    {canAddMore && (
                      <div
                        onClick={handleOpenModal}
                        className="p-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-xl m-2 transition-all cursor-pointer group"
                      >
                        <div className="w-12 h-12 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-600 mb-2 transition-colors">
                          <Plus size={20} />
                        </div>
                        <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-600">Add Another Phone</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Click to choose from catalog</p>
                      </div>
                    )}
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
                        {canAddMore && <div className="p-3 bg-slate-50/20" />}
                      </div>
                    )
                  })}
                </div>

                {/* Technical Highlights with Precise Spec Mapping */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 shadow-sm">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-semibold text-slate-700">Technical Highlights</h3>
                  </div>
                  {techSpecRows.map((specRow) => (
                    <div key={specRow.key} className="grid divide-x divide-slate-100 border-b border-slate-50 last:border-b-0" style={gridStyle}>
                      <div className="p-3 px-5 bg-slate-50 flex items-center">
                        <p className="text-xs font-medium text-slate-600">{specRow.label}</p>
                      </div>
                      {compareProducts.map((p) => (
                        <div key={p.id} className="p-3 text-center flex items-center justify-center">
                          <p className="text-xs text-slate-700 leading-relaxed font-normal">
                            {specRow.getValue(p)}
                          </p>
                        </div>
                      ))}
                      {canAddMore && <div className="p-3 bg-slate-50/20" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Device Modal — Accessible in both Empty and Populated States */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Add Smartphone to Compare</h3>
                <p className="text-xs text-slate-500">Pick from {catalog.length} smartphones in database</p>
              </div>
              <button
                type="button"
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
                  <button type="button" onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredCatalog.slice(0, 30).map((p) => (
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
                  <button
                    type="button"
                    className="bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  >
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
