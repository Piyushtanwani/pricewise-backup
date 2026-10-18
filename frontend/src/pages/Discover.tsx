import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import ProductCard from "../components/ui/ProductCard"
import { api } from "../services/api"
import type { Product, CatalogMeta } from "../types/product"
import { Loader2 } from "lucide-react"

export default function Discover() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState<CatalogMeta | null>(null)
  const [applePhones, setApplePhones] = useState<Product[]>([])
  const [samsungPhones, setSamsungPhones] = useState<Product[]>([])
  const [bestDeals, setBestDeals] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      try {
        setLoading(true)
        const [metaRes, appleRes, samsungRes, dealsRes] = await Promise.all([
          api.getCatalogMeta(),
          api.getProducts({ brand: "Apple", limit: 4 }),
          api.getProducts({ brand: "Samsung", limit: 4 }),
          api.getProducts({ sort: "best_deal", limit: 4 }),
        ])

        if (isMounted) {
          setMeta(metaRes)
          setApplePhones(appleRes.items || [])
          setSamsungPhones(samsungRes.items || [])
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
  }, [])

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Explore Smartphones</h1>
          <p className="text-sm text-slate-500">Browse brands, flagship collections, and best-value price drops</p>
        </div>

        {/* Brands Grid */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-slate-800 mb-4">All Brands in Catalogue</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {meta?.brands?.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => navigate(`/search?brand=${encodeURIComponent(name)}`)}
                className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-1.5 hover:border-indigo-400 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  {name.charAt(0)}
                </div>
                <span className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600">{name}</span>
                <span className="text-xs text-slate-400 font-mono">{count} Phones</span>
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
            {/* Apple Collection */}
            <section className="mb-10">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Popular Apple iPhones</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {applePhones.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>

            {/* Samsung Galaxy Collection */}
            <section className="mb-10">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Trending Samsung Galaxy</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {samsungPhones.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>

            {/* Best value deals */}
            <section className="mb-10">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Top Discount Deals</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {bestDeals.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
