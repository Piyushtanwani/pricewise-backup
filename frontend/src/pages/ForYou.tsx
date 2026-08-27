import { Sparkles } from "lucide-react"
import { products } from "../data/mockData"
import ProductCard from "../components/ui/ProductCard"

const sections = [
  {
    title: "Because you viewed Sony Headphones...",
    reason: "Recommended because you prefer audio + value",
    products: [0, 1, 5],
  },
  {
    title: "Based on your wishlist",
    reason: "Recommended because you prefer performance + battery",
    products: [2, 3, 4],
  },
  {
    title: "Best deals for you",
    reason: "Top discounts in your preferred categories",
    products: [4, 0, 2],
  },
]

export default function ForYou() {
  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={22} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Recommended for You</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">Products selected based on your preferences and browsing activity</p>

        <div className="space-y-10">
          {sections.map(({ title, reason, products: pIdxs }) => (
            <section key={title}>
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-bold text-slate-800">{title}</h2>
              </div>
              <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-full px-2.5 py-1 mb-4">
                <Sparkles size={11} />
                {reason}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {pIdxs.map((i) => (
                  <ProductCard key={products[i].id} product={products[i]} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
