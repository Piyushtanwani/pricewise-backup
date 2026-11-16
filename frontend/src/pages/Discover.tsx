import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import ProductCard from "../components/ui/ProductCard"
import { api } from "../services/api"
import type { Product, CatalogMeta } from "../types/product"
import { Loader2, Smartphone, Laptop, Tv, Tablet, Sparkles } from "lucide-react"

type CategoryTab = "All" | "Mobiles" | "Laptops" | "Tablets" | "TVs"

const CATEGORIES: Array<{ id: CategoryTab; label: string; icon: any; countLabel: string }> = [
  { id: "All", label: "All Electronics", icon: Sparkles, countLabel: "Devices" },
  { id: "Mobiles", label: "Smartphones", icon: Smartphone, countLabel: "Phones" },
  { id: "Laptops", label: "Laptops", icon: Laptop, countLabel: "Laptops" },
  { id: "Tablets", label: "Tablets", icon: Tablet, countLabel: "Tablets" },
  { id: "TVs", label: "Smart TVs", icon: Tv, countLabel: "TVs" },
]

export default function Discover() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("All")
  const [meta, setMeta] = useState<CatalogMeta | null>(null)
  const [collection1, setCollection1] = useState<Product[]>([])
  const [collection2, setCollection2] = useState<Product[]>([])
  const [bestDeals, setBestDeals] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      try {
        setLoading(true)
        const metaRes = await api.getCatalogMeta()
        if (isMounted) setMeta(metaRes)

        const categoryFilter = activeCategory === "All" ? undefined : activeCategory

        // Define dynamic collections based on selected category
        let p1Params: any = { limit: 4 }
        let p2Params: any = { limit: 4 }

        if (activeCategory === "Laptops") {
          p1Params = { category: "Laptops", brand: "Apple", limit: 4 }
          p2Params = { category: "Laptops", brand: "HP", limit: 4 }
        } else if (activeCategory === "TVs") {
          p1Params = { category: "TVs", brand: "Sony", limit: 4 }
          p2Params = { category: "TVs", brand: "Samsung", limit: 4 }
        } else if (activeCategory === "Tablets") {
          p1Params = { category: "Tablets", brand: "Apple", limit: 4 }
          p2Params = { category: "Tablets", brand: "Samsung", limit: 4 }
        } else if (activeCategory === "Mobiles") {
          p1Params = { category: "Mobiles", brand: "Apple", limit: 4 }
          p2Params = { category: "Mobiles", brand: "Samsung", limit: 4 }
        } else {
          // All
          p1Params = { category: "Laptops", limit: 4 }
          p2Params = { category: "TVs", limit: 4 }
        }

        const [res1, res2, dealsRes] = await Promise.all([
          api.getProducts(p1Params),
          api.getProducts(p2Params),
          api.getProducts({ category: categoryFilter, sort: "best_deal", limit: 4 }),
        ])

        if (isMounted) {
          setCollection1(res1.items || [])
          setCollection2(res2.items || [])
          setBestDeals(dealsRes.items || [])
        }
      } catch (err) {
        console.error("Failed to load discover page:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()
    return () => { isMounted = false }
  }, [activeCategory])

  const getCollection1Title = () => {
    switch (activeCategory) {
      case "Laptops": return "Apple MacBooks (M1, M2, M3, M4)"
      case "TVs": return "Sony Bravia 4K & OLED TVs"
      case "Tablets": return "Apple iPads (Pro, Air, Mini)"
      case "Mobiles": return "Popular Apple iPhones"
      default: return "Featured Laptops"
    }
  }

  const getCollection2Title = () => {
    switch (activeCategory) {
      case "Laptops": return "HP High-Performance & Gaming Laptops"
      case "TVs": return "Samsung Crystal 4K & Neo QLED TVs"
      case "Tablets": return "Samsung Galaxy Tabs & S-Pen Flagships"
      case "Mobiles": return "Trending Samsung Galaxy Phones"
      default: return "Trending 4K Smart TVs"
    }
  }

  // Filter brands based on category
  const relevantBrands = (meta?.brands || []).filter((b) => {
    if (activeCategory === "All") return true
    if (activeCategory === "Laptops") return ["Apple", "HP", "Dell", "Lenovo", "Asus", "Acer", "MSI", "Samsung"].includes(b.name)
    if (activeCategory === "TVs") return ["Sony", "Samsung", "LG", "Xiaomi", "TCL", "Vu", "Hisense", "OnePlus"].includes(b.name)
    if (activeCategory === "Tablets") return ["Apple", "Samsung", "Lenovo", "Xiaomi", "OnePlus", "Realme", "Motorola", "Honor"].includes(b.name)
    if (activeCategory === "Mobiles") return ["Apple", "Samsung", "OnePlus", "Vivo", "OPPO", "Motorola", "Google Pixel"].includes(b.name)
    return true
  })

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Explore Electronics Catalog</h1>
            <p className="text-sm text-slate-500">Browse verified brands, flagship series, and best-value price drops across categories</p>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs overflow-x-auto scrollbar-none">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeCategory === id
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/25"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Brands Grid */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">
              {activeCategory === "All" ? "Top Brands in Catalogue" : `${CATEGORIES.find(c => c.id === activeCategory)?.label} Brands`}
            </h2>
            <button
              onClick={() => navigate(`/search${activeCategory !== "All" ? `?category=${encodeURIComponent(activeCategory)}` : ""}`)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              View in Search →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {relevantBrands.slice(0, 16).map(({ name, count }) => (
              <button
                key={name}
                onClick={() => navigate(`/search?brand=${encodeURIComponent(name)}${activeCategory !== "All" ? `&category=${encodeURIComponent(activeCategory)}` : ""}`)}
                className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col items-center gap-1 hover:border-indigo-400 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  {name.charAt(0)}
                </div>
                <span className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 truncate max-w-full text-center">{name}</span>
                <span className="text-[11px] text-slate-400 font-mono">{count} Products</span>
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
            <p className="text-sm text-slate-500">Loading catalog from database...</p>
          </div>
        ) : (
          <>
            {/* Collection 1 */}
            {collection1.length > 0 && (
              <section className="mb-10">
                <h2 className="text-lg font-bold text-slate-800 mb-4">{getCollection1Title()}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {collection1.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}

            {/* Collection 2 */}
            {collection2.length > 0 && (
              <section className="mb-10">
                <h2 className="text-lg font-bold text-slate-800 mb-4">{getCollection2Title()}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {collection2.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}

            {/* Best value deals */}
            {bestDeals.length > 0 && (
              <section className="mb-10">
                <h2 className="text-lg font-bold text-slate-800 mb-4">
                  Top Discount Deals {activeCategory !== "All" && `in ${CATEGORIES.find(c => c.id === activeCategory)?.label}`}
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {bestDeals.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
