import { useState, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router"
import { SlidersHorizontal, Star, TrendingDown, X, GitCompare } from "lucide-react"
import ProductCard from "../components/ui/ProductCard"
import { products as initialProducts } from "../data/mockData"
import { getProducts, type Product } from "../services/api"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const sortOptions = ["Relevance", "Price: Low to High", "Price: High to Low", "Rating", "Best Deal"]
const storeFilters = ["Amazon", "Flipkart", "Croma", "Vijay Sales"]
const brandFilters = ["Apple", "Sony", "Samsung", "LG", "Google", "Vivo"]

export default function Search() {
  const [params] = useSearchParams()
  const query = params.get("q") || "wireless headphones"
  const navigate = useNavigate()

  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [sort, setSort] = useState("Relevance")
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [priceRange, setPriceRange] = useState([0, 150000])
  const [compareList, setCompareList] = useState<Product[]>([])
  const [filterOpen, setFilterOpen] = useState(false)

  useEffect(() => {
    const qParam = query === "trending" || query === "deals" ? "" : query
    getProducts({ q: qParam }).then(({ items }) => {
      if (items && items.length > 0) {
        setProducts(items)
      }
    })
  }, [query])

  const toggleStore = (s: string) =>
    setSelectedStores((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  const toggleBrand = (b: string) =>
    setSelectedBrands((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b])
  const toggleCompare = (p: Product) =>
    setCompareList((prev) => prev.find((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : prev.length < 3 ? [...prev, p] : prev)

  const filtered = products.filter((p) => {
    const matchBrand = selectedBrands.length === 0 || selectedBrands.includes(p.brand)
    const matchStore = selectedStores.length === 0 || selectedStores.includes(p.bestStore)
    const matchPrice = p.bestPrice >= priceRange[0] && p.bestPrice <= priceRange[1]
    return matchBrand && matchStore && matchPrice
  })

  const Sidebar = () => (
    <aside className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Brand</h3>
        <div className="space-y-1.5">
          {brandFilters.map((b) => (
            <label key={b} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedBrands.includes(b)}
                onChange={() => toggleBrand(b)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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
            min={0}
            max={150000}
            step={1000}
            value={priceRange[1]}
            onChange={(e) => setPriceRange([priceRange[0], +e.target.value])}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>{fmt(priceRange[0])}</span>
            <span>{fmt(priceRange[1])}</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Store</h3>
        <div className="space-y-1.5">
          {storeFilters.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedStores.includes(s)}
                onChange={() => toggleStore(s)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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
            <input type="checkbox" className="rounded border-slate-300 text-indigo-600" />
            <span className="flex items-center gap-1 text-sm text-slate-600">
              {Array(r).fill(0).map((_, i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
              <span className="text-slate-400">& up</span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Discount</h3>
        {["10% or more", "20% or more", "30% or more"].map((d) => (
          <label key={d} className="flex items-center gap-2 cursor-pointer group mb-1.5">
            <input type="checkbox" className="rounded border-slate-300 text-indigo-600" />
            <span className="text-sm text-slate-600 group-hover:text-slate-900">{d}</span>
          </label>
        ))}
      </div>

      {(selectedBrands.length > 0 || selectedStores.length > 0) && (
        <button
          onClick={() => { setSelectedBrands([]); setSelectedStores([]) }}
          className="w-full text-sm text-red-500 hover:text-red-700 border border-red-200 rounded-lg py-2 transition-colors"
        >
          Clear All Filters
        </button>
      )}
    </aside>
  )

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 capitalize mb-1">{query}</h1>
          <p className="text-sm text-slate-500">{filtered.length} products found</p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar — desktop */}
          <div className="hidden lg:block w-56 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-20">
              <Sidebar />
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {/* Sort / Filter bar */}
            <div className="flex items-center gap-3 mb-5 bg-white rounded-xl border border-slate-200 px-4 py-2.5">
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className="lg:hidden flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                <SlidersHorizontal size={15} />
                Filters
              </button>
              <div className="hidden lg:flex items-center gap-1 text-sm text-slate-500">
                <span>Sort by</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {sortOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      sort === s
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile filter drawer */}
            {filterOpen && (
              <div className="lg:hidden bg-white rounded-xl border border-slate-200 p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">Filters</h3>
                  <button onClick={() => setFilterOpen(false)}><X size={16} /></button>
                </div>
                <Sidebar />
              </div>
            )}

            {/* Active filters */}
            {(selectedBrands.length > 0 || selectedStores.length > 0) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {[...selectedBrands, ...selectedStores].map((tag) => (
                  <span key={tag} className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
                    {tag}
                    <button onClick={() => {
                      setSelectedBrands((prev) => prev.filter((x) => x !== tag))
                      setSelectedStores((prev) => prev.filter((x) => x !== tag))
                    }}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Product grid */}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onCompare={toggleCompare}
                  selected={compareList.some((x) => x.id === p.id)}
                />
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No products match your filters</h3>
                <p className="text-slate-400 text-sm">Try adjusting or clearing your filters</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison tray */}
      {compareList.length > 0 && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-40 bg-indigo-900 border-t border-indigo-700 px-6 py-3">
          <div className="max-w-[1440px] mx-auto flex items-center gap-4">
            <div className="flex items-center gap-3 flex-1 overflow-x-auto">
              <GitCompare size={16} className="text-indigo-300 shrink-0" />
              <span className="text-sm text-white font-medium shrink-0">
                {compareList.length} product{compareList.length > 1 ? "s" : ""} selected
              </span>
              {compareList.map((p) => (
                <div key={p.id} className="flex items-center gap-2 bg-indigo-800 rounded-lg px-2.5 py-1 shrink-0">
                  <span className="text-xs text-white">{p.brand}</span>
                  <button onClick={() => toggleCompare(p)}>
                    <X size={11} className="text-indigo-300 hover:text-white" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/compare")}
              className="bg-white text-indigo-900 font-semibold text-sm px-5 py-2 rounded-lg hover:bg-indigo-50 transition-colors shrink-0"
            >
              Compare Now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
