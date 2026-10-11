import { useState, useEffect, useMemo } from "react"
import { useSearchParams, useNavigate } from "react-router"
import { SlidersHorizontal, Star, X, GitCompare, Loader2, Search as SearchIcon, ArrowRight, RotateCcw } from "lucide-react"
import ProductCard from "../components/ui/ProductCard"
import { api } from "../services/api"
import type { Product, CatalogMeta } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const sortOptions = ["Relevance", "Price: Low to High", "Price: High to Low", "Rating", "Best Deal"]

const KNOWN_BRANDS = ["apple", "iphone", "samsung", "oneplus", "vivo", "realme", "motorola", "oppo"]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get("q") || params.get("search") || ""
  const brandParam = params.get("brand")
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState(query)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [meta, setMeta] = useState<CatalogMeta | null>(null)
  const [loading, setLoading] = useState(true)

  const [sort, setSort] = useState("Relevance")
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [selectedBrands, setSelectedBrands] = useState<string[]>(brandParam ? [brandParam] : [])
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 450000])
  const [priceAdjusted, setPriceAdjusted] = useState(false)
  const [minRating, setMinRating] = useState<number | undefined>(undefined)
  const [compareList, setCompareList] = useState<Product[]>([])
  const [filterOpen, setFilterOpen] = useState(false)

  // Keep search input in sync with query parameter
  useEffect(() => {
    setSearchInput(query)
  }, [query])

  // Sync URL brand parameter if present
  useEffect(() => {
    if (brandParam && !selectedBrands.includes(brandParam)) {
      setSelectedBrands([brandParam])
    }
  }, [brandParam])

  // Fetch catalog products and metadata
  useEffect(() => {
    let isMounted = true
    setLoading(true)

    Promise.all([
      api.getCatalogMeta().catch(() => null),
      api.getProducts({ limit: 200 }).catch(() => ({ items: [], total: 0 })),
    ]).then(([metaData, productsRes]) => {
      if (!isMounted) return
      if (metaData) {
        setMeta(metaData)
        if (metaData.priceRange) {
          setPriceRange([metaData.priceRange.min, metaData.priceRange.max])
        }
      }
      if (productsRes && productsRes.items) {
        setAllProducts(productsRes.items)
      }
    }).finally(() => {
      if (isMounted) setLoading(false)
    })

    return () => { isMounted = false }
  }, [])

  // Handle client-side filtering and sorting for instant response
  const displayedProducts = useMemo(() => {
    let list = [...allProducts]
    const qLower = query.trim().toLowerCase()

    // Query filter
    if (qLower) {
      list = list.filter((p) => {
        const nameMatch = p.name.toLowerCase().includes(qLower)
        const brandMatch = p.brand.toLowerCase().includes(qLower)
        const specMatch = (p.specs || []).some((s) => s.toLowerCase().includes(qLower))
        return nameMatch || brandMatch || specMatch
      })
    }

    // Brand filter
    if (selectedBrands.length > 0) {
      list = list.filter((p) =>
        selectedBrands.some((b) => b.toLowerCase() === (p.brand || "").toLowerCase())
      )
    }

    // Store filter
    if (selectedStores.length > 0) {
      list = list.filter((p) =>
        selectedStores.some((s) => s.toLowerCase() === (p.bestStore || "").toLowerCase())
      )
    }

    // Price range filter
    if (priceAdjusted) {
      list = list.filter((p) => p.bestPrice >= priceRange[0] && p.bestPrice <= priceRange[1])
    }

    // Rating filter
    if (minRating !== undefined) {
      list = list.filter((p) => p.rating >= minRating)
    }

    // Sort
    switch (sort) {
      case "Price: Low to High":
        list.sort((a, b) => a.bestPrice - b.bestPrice)
        break
      case "Price: High to Low":
        list.sort((a, b) => b.bestPrice - a.bestPrice)
        break
      case "Rating":
        list.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
        break
      case "Best Deal":
        list.sort((a, b) => (b.discount || 0) - (a.discount || 0))
        break
      case "Relevance":
      default:
        // Keep natural relevance / review count
        break
    }

    return list
  }, [allProducts, query, selectedBrands, selectedStores, priceAdjusted, priceRange, minRating, sort])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextQ = searchInput.trim()
    const newParams = new URLSearchParams()
    if (nextQ) newParams.set("q", nextQ)
    setParams(newParams)
  }

  const clearSearchQuery = () => {
    const newParams = new URLSearchParams(params)
    newParams.delete("q")
    newParams.delete("search")
    setParams(newParams)
    setSearchInput("")
  }

  const toggleStore = (s: string) =>
    setSelectedStores((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const toggleBrand = (b: string) => {
    setSelectedBrands((prev) => {
      const exists = prev.includes(b)
      const next = exists ? prev.filter((x) => x !== b) : [...prev, b]

      // If user adds a brand and current search query was a conflicting brand name, clear search query
      if (!exists && query) {
        const qLower = query.toLowerCase()
        const isConflictingBrand = KNOWN_BRANDS.some((kb) => qLower.includes(kb)) && !qLower.includes(b.toLowerCase())
        if (isConflictingBrand) {
          clearSearchQuery()
        }
      }
      return next
    })
  }

  const toggleCompare = (p: Product) =>
    setCompareList((prev) => prev.find((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : prev.length < 3 ? [...prev, p] : prev)

  const clearAllFilters = () => {
    setSelectedBrands([])
    setSelectedStores([])
    setMinRating(undefined)
    setPriceAdjusted(false)
    if (meta?.priceRange) setPriceRange([meta.priceRange.min, meta.priceRange.max])
    clearSearchQuery()
  }

  const brandFilters = meta?.brands?.map((b) => b.name) || ["Apple", "Samsung", "OnePlus", "Vivo", "Realme", "Motorola", "OPPO"]
  const storeFilters = meta?.stores?.map((s) => s.name) || ["Amazon", "Flipkart", "Croma", "Smartprix"]

  const Sidebar = () => (
    <aside className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Brand</h3>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {brandFilters.map((b) => (
            <label key={b} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedBrands.includes(b)}
                onChange={() => toggleBrand(b)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-slate-600 group-hover:text-slate-900">{b}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Price Range</h3>
        <div className="space-y-2">
          <input
            type="range"
            min={meta?.priceRange?.min || 0}
            max={meta?.priceRange?.max || 450000}
            step={2000}
            value={priceRange[1]}
            onChange={(e) => {
              setPriceRange([priceRange[0], +e.target.value])
              setPriceAdjusted(true)
            }}
            className="w-full accent-indigo-600 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-500 font-mono">
            <span>{fmt(priceRange[0])}</span>
            <span>{fmt(priceRange[1])}</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Retailer Store</h3>
        <div className="space-y-1.5">
          {storeFilters.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedStores.includes(s)}
                onChange={() => toggleStore(s)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-slate-600 group-hover:text-slate-900">{s}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Rating</h3>
        {[4, 3, 2].map((r) => (
          <label key={r} className="flex items-center gap-2 cursor-pointer group mb-1.5">
            <input
              type="radio"
              name="rating"
              checked={minRating === r}
              onChange={() => setMinRating(minRating === r ? undefined : r)}
              className="border-slate-300 text-indigo-600 cursor-pointer"
            />
            <span className="flex items-center gap-1 text-sm text-slate-600">
              {[...Array(r)].map((_, i) => (
                <Star key={i} size={12} className="fill-amber-400 text-amber-400" />
              ))}
              <span className="text-slate-400">& up</span>
            </span>
          </label>
        ))}
      </div>

      {(selectedBrands.length > 0 || selectedStores.length > 0 || minRating !== undefined || priceAdjusted || query) && (
        <button
          onClick={clearAllFilters}
          className="w-full text-sm text-red-500 hover:text-red-700 border border-red-200 rounded-lg py-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={13} />
          Clear All Filters
        </button>
      )}
    </aside>
  )

  const activeFiltersCount =
    (query ? 1 : 0) +
    selectedBrands.length +
    selectedStores.length +
    (minRating !== undefined ? 1 : 0) +
    (priceAdjusted ? 1 : 0)

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Top Search Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="flex-1 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus-within:border-indigo-400 focus-within:bg-white transition-all">
              <SearchIcon size={18} className="text-slate-400 shrink-0" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search smartphone name, brand (Samsung, Apple, OnePlus, Vivo, Realme, Motorola, OPPO)..."
                className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 outline-none bg-transparent"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("")
                    clearSearchQuery()
                  }}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-md shadow-indigo-600/20"
            >
              Search <ArrowRight size={15} />
            </button>
          </form>
        </div>

        {/* Results Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 capitalize mb-1">
              {query
                ? `Search: "${query}"`
                : selectedBrands.length > 0
                ? `${selectedBrands.join(", ")} Mobiles`
                : selectedStores.length > 0
                ? `Available at ${selectedStores.join(", ")}`
                : "All Smartphones"}
            </h1>
            <p className="text-sm text-slate-500">
              Showing {displayedProducts.length} of {allProducts.length} smartphones in database
            </p>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar — desktop */}
          <div className="hidden lg:block w-56 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-20 shadow-sm">
              <Sidebar />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Sort & Mobile filter trigger */}
            <div className="flex items-center gap-3 mb-4 bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className="lg:hidden flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <SlidersHorizontal size={15} />
                Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
              </button>
              <div className="hidden lg:flex items-center gap-1 text-sm text-slate-500">
                <span>Sort by</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {sortOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      sort === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile filters drawer */}
            {filterOpen && (
              <div className="lg:hidden bg-white rounded-xl border border-slate-200 p-5 mb-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-slate-800">Filters</span>
                  <button onClick={() => setFilterOpen(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={18} />
                  </button>
                </div>
                <Sidebar />
              </div>
            )}

            {/* Active filter chips */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4 bg-white/70 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active:</span>

                {query && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-medium">
                    Search: "{query}"
                    <button onClick={clearSearchQuery} className="cursor-pointer hover:text-indigo-900">
                      <X size={12} />
                    </button>
                  </span>
                )}

                {selectedBrands.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
                    Brand: {b}
                    <button onClick={() => toggleBrand(b)} className="cursor-pointer hover:text-blue-900">
                      <X size={12} />
                    </button>
                  </span>
                ))}

                {selectedStores.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                    Store: {s}
                    <button onClick={() => toggleStore(s)} className="cursor-pointer hover:text-emerald-900">
                      <X size={12} />
                    </button>
                  </span>
                ))}

                {priceAdjusted && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full font-medium">
                    Max: {fmt(priceRange[1])}
                    <button onClick={() => setPriceAdjusted(false)} className="cursor-pointer hover:text-purple-900">
                      <X size={12} />
                    </button>
                  </span>
                )}

                {minRating !== undefined && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                    ★ {minRating}+ Stars
                    <button onClick={() => setMinRating(undefined)} className="cursor-pointer hover:text-amber-900">
                      <X size={12} />
                    </button>
                  </span>
                )}

                <button
                  onClick={clearAllFilters}
                  className="text-xs text-red-500 hover:text-red-700 underline font-medium ml-auto cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Loading Indicator */}
            {loading ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-80 bg-white rounded-xl border border-slate-200 animate-pulse" />
                ))}
              </div>
            ) : (
              /* Product grid */
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {displayedProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onCompare={toggleCompare}
                    selected={compareList.some((x) => x.id === p.id)}
                  />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && displayedProducts.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <div className="text-5xl mb-4">📱</div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">No smartphones match these filters</h3>
                <p className="text-slate-500 text-sm mb-5 max-w-md mx-auto">
                  {query
                    ? `No products found for "${query}" with the current filters. Try removing the search query or selecting a different brand.`
                    : "No products found matching the selected brand and store filters."}
                </p>
                <div className="flex justify-center gap-3">
                  {query && (
                    <button
                      onClick={clearSearchQuery}
                      className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer font-medium"
                    >
                      Clear Search "{query}"
                    </button>
                  )}
                  <button
                    onClick={clearAllFilters}
                    className="bg-slate-100 text-slate-700 text-sm px-4 py-2 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer font-medium"
                  >
                    Reset All Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compare floating bar */}
      {compareList.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700">
          <div className="flex items-center gap-2">
            <GitCompare size={16} className="text-indigo-400" />
            <span className="text-sm font-medium">{compareList.length}/3 to compare</span>
          </div>
          <div className="flex gap-2">
            {compareList.map((p) => (
              <div key={p.id} className="relative group">
                <img
                  src={p.image}
                  alt={p.name}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-contain bg-slate-800 p-0.5 border border-slate-700"
                />
                <button
                  onClick={() => toggleCompare(p)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate(`/compare?ids=${compareList.map((x) => x.id).join(",")}`)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            Compare Now
          </button>
        </div>
      )}
    </div>
  )
}
