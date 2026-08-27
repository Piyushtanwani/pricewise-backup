import { useNavigate } from "react-router"
import { categories, products } from "../data/mockData"
import ProductCard from "../components/ui/ProductCard"
import Footer from "../components/layout/Footer"

export default function Discover() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Explore Products</h1>
          <p className="text-sm text-slate-500">Browse categories, trending picks, and best-value finds</p>
        </div>

        {/* Category grid */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-slate-800 mb-4">All Categories</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
            {categories.map(({ name, icon, count }) => (
              <button
                key={name}
                onClick={() => navigate(`/search?q=${name}`)}
                className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col items-center gap-1.5 hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-700">{name}</span>
                <span className="text-xs text-slate-400 font-mono">{count.toLocaleString("en-IN")}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Popular in Laptops */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Popular in Laptops</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.filter((p) => p.category === "Laptops" || p.brand === "Apple").slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>

        {/* Trending this week */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Trending This Week</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>

        {/* Best value */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Best Value Products</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.slice(2).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      </div>
      <Footer />
    </div>
  )
}
