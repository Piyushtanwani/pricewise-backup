import { useState, useEffect } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import ProductCard from "../components/ui/ProductCard"
import { api } from "../services/api"
import type { Product } from "../types/product"

export default function ForYou() {
  const [flagships, setFlagships] = useState<Product[]>([])
  const [budgetPicks, setBudgetPicks] = useState<Product[]>([])
  const [topDeals, setTopDeals] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    async function loadRecommendations() {
      try {
        setLoading(true)
        const [flagshipRes, budgetRes, dealsRes] = await Promise.all([
          api.getProducts({ sort: "price_desc", limit: 4 }),
          api.getProducts({ sort: "price_asc", limit: 4 }),
          api.getProducts({ sort: "best_deal", limit: 4 }),
        ])

        if (isMounted) {
          setFlagships(flagshipRes.items || [])
          setBudgetPicks(budgetRes.items || [])
          setTopDeals(dealsRes.items || [])
        }
      } catch (err) {
        console.error("Failed to load recommendations:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadRecommendations()
    return () => { isMounted = false }
  }, [])

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={22} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Recommended for You</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">Curated smartphones from our live database based on performance, budget, and discount trends</p>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
            <p className="text-sm text-slate-500">Generating personalized recommendations...</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Top Deals Section */}
            <section>
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-bold text-slate-800">Best Value & High Discount Deals</h2>
              </div>
              <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-full px-2.5 py-1 mb-4">
                <Sparkles size={11} />
                Calculated largest gap between retail MRP and store selling price
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {topDeals.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>

            {/* Flagship Section */}
            <section>
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-bold text-slate-800">Premium Flagships (Pro & Ultra Editions)</h2>
              </div>
              <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-full px-2.5 py-1 mb-4">
                <Sparkles size={11} />
                Top tier processors, titanium finishes, and high-spec zoom cameras
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {flagships.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>

            {/* Budget Value Section */}
            <section>
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-bold text-slate-800">Best Value Budget 5G Phones</h2>
              </div>
              <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-full px-2.5 py-1 mb-4">
                <Sparkles size={11} />
                Maximum battery capacity and 5G connectivity at entry prices
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {budgetPicks.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
