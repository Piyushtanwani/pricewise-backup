import { useState, useEffect } from "react"
import { Sparkles, Loader2, TrendingDown, Star, BookmarkCheck } from "lucide-react"
import ProductCard from "../components/ui/ProductCard"
import { api } from "../services/api"
import { useAuth } from "../context/AuthContext"
import type { Product } from "../types/product"

export default function ForYou() {
  const { isAuthenticated } = useAuth()
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [isPersonalised, setIsPersonalised] = useState(false)
  const [topDeals, setTopDeals] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadRecommendations() {
      try {
        setLoading(true)
        const [recRes, dealsRes] = await Promise.all([
          api.getRecommendations(8).catch(() => ({ personalised: false, items: [] })),
          api.getProducts({ sort: "best_deal", limit: 4 }).catch(() => ({ items: [] })),
        ])

        if (isMounted) {
          setRecommendations(recRes.items || [])
          setIsPersonalised(Boolean(recRes.personalised))
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
  }, [isAuthenticated])

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={22} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">
            {isPersonalised ? "Personalized For You" : "Curated Smartphone Picks"}
          </h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          {isPersonalised
            ? "Recommendations ranked by matching brands, categories, and deal scores from your saved wishlist and watchlist."
            : "Top trending smartphones and high-discount deals across retailers. Save items to your wishlist to personalize this feed."}
        </p>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
            <p className="text-sm text-slate-500">Loading recommendations...</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Recommendations Section */}
            {recommendations.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {isPersonalised ? "Based on Your Saved Smartphones" : "Popular with PriceWise Shoppers"}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {isPersonalised
                        ? "Curated deterministic ranking based on your activity and brand interests"
                        : "Deterministic ranking by rating, review volume, and discount gap"}
                    </p>
                  </div>
                  {isPersonalised && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <BookmarkCheck size={12} />
                      Personalized Feed
                    </span>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {recommendations.map((p) => (
                    <div key={p.id} className="flex flex-col">
                      {p.reason && (
                        <div className="mb-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] font-medium text-indigo-700 truncate">
                          {p.reason}
                        </div>
                      )}
                      <ProductCard product={p} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Top Deals Section */}
            {topDeals.length > 0 && (
              <section className="pt-6 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <span>Highest Discount Deals</span>
                      <TrendingDown size={18} className="text-emerald-600" />
                    </h2>
                    <p className="text-xs text-slate-500">
                      Smartphones with the widest gap between manufacturer retail MRP and current verified store price
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {topDeals.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
