import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams, useNavigate } from "react-router"
import {
  SlidersHorizontal,
  Star,
  X,
  GitCompare,
  Loader2,
  Search as SearchIcon,
  ArrowRight,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import ProductCard from "../components/ui/ProductCard"
import { getCompareState, notifyCompareChange, COMPARE_CLEARED_KEY, COMPARE_STORAGE_KEY } from "../hooks/useCompareAction"
import { api } from "../services/api"
import type { Product, CatalogMeta } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const sortOptions = [
  "Relevance",
  "Price: Low to High",
  "Price: High to Low",
  "Rating",
  "Best Deal",
]

const KNOWN_BRANDS = ["apple", "iphone", "samsung", "oneplus", "vivo", "realme", "motorola", "oppo"]

interface SearchSidebarProps {
  brandFilters: string[]
  storeFilters: string[]
  selectedBrands: string[]
  selectedStores: string[]
  priceRange: [number, number]
  priceAdjusted: boolean
  minRating: number | undefined
  meta: CatalogMeta | null
  query: string
  onToggleBrand: (b: string) => void
  onToggleStore: (s: string) => void
  onPriceChange: (val: number) => void
  onRatingChange: (r: number) => void
  onClearAll: () => void
}

function SearchSidebar({
  brandFilters,
  storeFilters,
  selectedBrands,
  selectedStores,
  priceRange,
  priceAdjusted,
  minRating,
  meta,
  query,
  onToggleBrand,
  onToggleStore,
  onPriceChange,
  onRatingChange,
  onClearAll,
}: SearchSidebarProps) {
  const hasActiveFilters =
    Boolean(query) ||
    selectedBrands.length > 0 ||
    selectedStores.length > 0 ||
    minRating !== undefined ||
    priceAdjusted

  return (
    <aside className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Brand</h3>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {brandFilters.map((b) => (
            <label key={b} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedBrands.includes(b)}
                onChange={() => onToggleBrand(b)}
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
            onChange={(e) => onPriceChange(+e.target.value)}
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
                onChange={() => onToggleStore(s)}
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
              onChange={() => onRatingChange(r)}
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

      {hasActiveFilters && (
        <button
          onClick={onClearAll}
          className="w-full text-sm text-red-500 hover:text-red-700 border border-red-200 rounded-lg py-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={13} />
          Clear All Filters
        </button>
      )}
    </aside>
  )
}

export default function Search() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const query = params.get("q") || params.get("search") || ""
  const brandParam = params.get("brand")
  const storeParam = params.get("store")
  const sortParam = params.get("sort") || "Relevance"
  const pageParam = parseInt(params.get("page") || "1", 10)

  const [searchInput, setSearchInput] = useState(query)
  const [products, setProducts] = useState<Product[]>([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [meta, setMeta] = useState<CatalogMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sort, setSort] = useState(sortParam)
  const [selectedStores, setSelectedStores] = useState<string[]>(
    storeParam ? storeParam.split(",").filter(Boolean) : []
  )
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    brandParam ? brandParam.split(",").filter(Boolean) : []
  )
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 450000])
  const [priceAdjusted, setPriceAdjusted] = useState(false)
  const [minRating, setMinRating] = useState<number | undefined>(undefined)
  const [compareList, setCompareList] = useState<Product[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(pageParam || 1)
  const pageSize = 20

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch catalog metadata once on mount
  useEffect(() => {
    let isMounted = true
    api.getCatalogMeta()
      .then((metaData) => {
        if (!isMounted || !metaData) return
        setMeta(metaData)
        if (metaData.priceRange && !priceAdjusted) {
          setPriceRange([metaData.priceRange.min, metaData.priceRange.max])
        }
      })
      .catch((err) => console.error("Error loading catalog metadata:", err))

    return () => { isMounted = false }
  }, [priceAdjusted])

  // Sync search input if query param changes externally
  useEffect(() => {
    setSearchInput(query)
  }, [query])

  // Fetch products from server whenever query, filters, sort, or page changes
  const executeSearch = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await api.getProducts({
        q: query || undefined,
        brand: selectedBrands.length > 0 ? selectedBrands : undefined,
        store: selectedStores.length > 0 ? selectedStores : undefined,
        minPrice: priceAdjusted ? priceRange[0] : undefined,
        maxPrice: priceAdjusted ? priceRange[1] : undefined,
        minRating,
        sort,
        page: currentPage,
        limit: pageSize,
      })

      setProducts(res.items || [])
      setTotalProducts(res.total || 0)
    } catch (err: any) {
      console.error("Search query failed:", err)
      setError("Failed to load products. Please check your connection and try again.")
      setProducts([])
      setTotalProducts(0)
    } finally {
      setLoading(false)
    }
  }, [query, selectedBrands, selectedStores, priceAdjusted, priceRange, minRating, sort, currentPage, pageSize])

  // Debounced search trigger to avoid excessive API calls while adjusting range
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch()
    }, 200)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [executeSearch])

  // Update URL parameters when main filters change
  const updateUrlParams = (newQuery?: string, newBrands?: string[], newStores?: string[], newSort?: string, newPage?: number) => {
    const nextParams = new URLSearchParams()
    const qVal = newQuery !== undefined ? newQuery : query
    const bVal = newBrands !== undefined ? newBrands : selectedBrands
    const sVal = newStores !== undefined ? newStores : selectedStores
    const sortVal = newSort !== undefined ? newSort : sort
    const pVal = newPage !== undefined ? newPage : currentPage

    if (qVal) nextParams.set("q", qVal)
    if (bVal.length > 0) nextParams.set("brand", bVal.join(","))
    if (sVal.length > 0) nextParams.set("store", sVal.join(","))
    if (sortVal && sortVal !== "Relevance") nextParams.set("sort", sortVal)
    if (pVal > 1) nextParams.set("page", String(pVal))

    setParams(nextParams)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextQ = searchInput.trim()
    setCurrentPage(1)
    updateUrlParams(nextQ, undefined, undefined, undefined, 1)
  }

  const clearSearchQuery = () => {
    setSearchInput("")
    setCurrentPage(1)
    updateUrlParams("", undefined, undefined, undefined, 1)
  }

  const toggleBrand = (b: string) => {
    const next = selectedBrands.includes(b)
      ? selectedBrands.filter((x) => x !== b)
      : [...selectedBrands, b]

    setSelectedBrands(next)
    setCurrentPage(1)

    // Clear conflicting query if brand name was in query
    let nextQuery = query
    if (!selectedBrands.includes(b) && query) {
      const qLower = query.toLowerCase()
      const isConflicting = KNOWN_BRANDS.some((kb) => qLower.includes(kb)) && !qLower.includes(b.toLowerCase())
      if (isConflicting) {
        nextQuery = ""
        setSearchInput("")
      }
    }

    updateUrlParams(nextQuery, next, undefined, undefined, 1)
  }

  const toggleStore = (s: string) => {
    const next = selectedStores.includes(s)
      ? selectedStores.filter((x) => x !== s)
      : [...selectedStores, s]

    setSelectedStores(next)
    setCurrentPage(1)
    updateUrlParams(undefined, undefined, next, undefined, 1)
  }

  const handlePriceChange = (maxPriceVal: number) => {
    setPriceRange([priceRange[0], maxPriceVal])
    setPriceAdjusted(true)
    setCurrentPage(1)
  }

  const handleRatingChange = (r: number) => {
    const next = minRating === r ? undefined : r
    setMinRating(next)
    setCurrentPage(1)
  }

  const handleSortChange = (newSort: string) => {
    setSort(newSort)
    setCurrentPage(1)
    updateUrlParams(undefined, undefined, undefined, newSort, 1)
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    updateUrlParams(undefined, undefined, undefined, undefined, newPage)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const clearAllFilters = () => {
    setSelectedBrands([])
    setSelectedStores([])
    setMinRating(undefined)
    setPriceAdjusted(false)
    if (meta?.priceRange) {
      setPriceRange([meta.priceRange.min, meta.priceRange.max])
    }
    setSearchInput("")
    setCurrentPage(1)
    setParams(new URLSearchParams())
  }

  const toggleCompare = (p: Product) => {
    setCompareList((prev) =>
      prev.find((x) => x.id === p.id)
        ? prev.filter((x) => x.id !== p.id)
        : prev.length < 3
        ? [...prev, p]
        : prev
    )
  }

  const brandFilters =
    meta?.brands?.map((b) => b.name) || [
      "Apple",
      "Samsung",
      "OnePlus",
      "Vivo",
      "Realme",
      "Motorola",
      "OPPO",
    ]
  const storeFilters =
    meta?.stores?.map((s) => s.name) || [
      "Amazon",
      "Flipkart",
      "Croma",
      "Vijay Sales",
    ]

  const activeFiltersCount =
    (query ? 1 : 0) +
    selectedBrands.length +
    selectedStores.length +
    (minRating !== undefined ? 1 : 0) +
    (priceAdjusted ? 1 : 0)

  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize))

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
                  onClick={clearSearchQuery}
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
              Showing {products.length} of {totalProducts} smartphones in database
            </p>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar — desktop */}
          <div className="hidden lg:block w-56 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-20 shadow-sm">
              <SearchSidebar
                brandFilters={brandFilters}
                storeFilters={storeFilters}
                selectedBrands={selectedBrands}
                selectedStores={selectedStores}
                priceRange={priceRange}
                priceAdjusted={priceAdjusted}
                minRating={minRating}
                meta={meta}
                query={query}
                onToggleBrand={toggleBrand}
                onToggleStore={toggleStore}
                onPriceChange={handlePriceChange}
                onRatingChange={handleRatingChange}
                onClearAll={clearAllFilters}
              />
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
                    onClick={() => handleSortChange(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      sort === s
                        ? "bg-indigo-600 text-white font-semibold"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>
                <SearchSidebar
                  brandFilters={brandFilters}
                  storeFilters={storeFilters}
                  selectedBrands={selectedBrands}
                  selectedStores={selectedStores}
                  priceRange={priceRange}
                  priceAdjusted={priceAdjusted}
                  minRating={minRating}
                  meta={meta}
                  query={query}
                  onToggleBrand={toggleBrand}
                  onToggleStore={toggleStore}
                  onPriceChange={handlePriceChange}
                  onRatingChange={handleRatingChange}
                  onClearAll={clearAllFilters}
                />
              </div>
            )}

            {/* Active filter chips */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4 bg-white/70 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Active:
                </span>

                {query && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-medium">
                    Search: "{query}"
                    <button
                      onClick={clearSearchQuery}
                      className="cursor-pointer hover:text-indigo-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}

                {selectedBrands.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium"
                  >
                    Brand: {b}
                    <button
                      onClick={() => toggleBrand(b)}
                      className="cursor-pointer hover:text-blue-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}

                {selectedStores.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium"
                  >
                    Store: {s}
                    <button
                      onClick={() => toggleStore(s)}
                      className="cursor-pointer hover:text-emerald-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}

                {priceAdjusted && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full font-medium">
                    Max: {fmt(priceRange[1])}
                    <button
                      onClick={() => {
                        setPriceAdjusted(false)
                        if (meta?.priceRange) {
                          setPriceRange([meta.priceRange.min, meta.priceRange.max])
                        }
                      }}
                      className="cursor-pointer hover:text-purple-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}

                {minRating !== undefined && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                    ★ {minRating}+ Stars
                    <button
                      onClick={() => setMinRating(undefined)}
                      className="cursor-pointer hover:text-amber-900"
                    >
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

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700 flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={executeSearch}
                  className="font-semibold underline cursor-pointer hover:text-red-900"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading Indicator */}
            {loading ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-80 bg-white rounded-xl border border-slate-200 animate-pulse flex flex-col p-4 justify-between"
                  >
                    <div className="w-full h-40 bg-slate-100 rounded-lg" />
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-100 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Product grid */
              <>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {products.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onCompare={toggleCompare}
                      selected={compareList.some((x) => x.id === p.id)}
                    />
                  ))}
                </div>

                {/* Pagination Controls */}
                {!loading && totalProducts > pageSize && (
                  <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-slate-500 font-medium">
                      Showing{" "}
                      <span className="font-semibold text-slate-800">
                        {(currentPage - 1) * pageSize + 1}
                      </span>
                      –
                      <span className="font-semibold text-slate-800">
                        {Math.min(currentPage * pageSize, totalProducts)}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-slate-800">{totalProducts}</span>{" "}
                      smartphones
                    </p>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label="Previous Page"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(
                          (p) =>
                            p === 1 ||
                            p === totalPages ||
                            Math.abs(p - currentPage) <= 1
                        )
                        .reduce<(number | string)[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                            acc.push("...")
                          }
                          acc.push(p)
                          return acc
                        }, [])
                        .map((item, idx) =>
                          typeof item === "string" ? (
                            <span key={`ellipsis-${idx}`} className="px-2 text-xs text-slate-400">
                              ...
                            </span>
                          ) : (
                            <button
                              key={item}
                              onClick={() => handlePageChange(item)}
                              className={`w-9 h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                currentPage === item
                                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-bold"
                                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              {item}
                            </button>
                          )
                        )}

                      <button
                        onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label="Next Page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!loading && products.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <div className="text-5xl mb-4">📱</div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  No smartphones match these filters
                </h3>
                <p className="text-slate-500 text-sm mb-5 max-w-md mx-auto">
                  {query
                    ? `No products found for "${query}" with the current filters. Try adjusting your search term or clearing filters.`
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
            onClick={() => {
              const ids = compareList.map((x) => x.id)
              try {
                localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(ids))
                localStorage.removeItem(COMPARE_CLEARED_KEY)
                notifyCompareChange()
              } catch {}
              navigate(`/compare?ids=${ids.join(",")}`)
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            Compare Now
          </button>
        </div>
      )}
    </div>
  )
}
