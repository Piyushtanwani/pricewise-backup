import { Heart, GitCompare, Bell, TrendingDown, TrendingUp, Minus, Star } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import Badge from "./Badge"

type Product = {
  id: string
  brand: string
  name: string
  image: string
  rating: number
  reviews: number
  specs: string[]
  bestPrice: number
  mrp: number
  discount: number
  bestStore: string
  stores: number
  trend: string
  aiVerdict: string
  verdictColor: string
  category: string
  priceHistory: number[]
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

export default function ProductCard({ product, onCompare, selected }: {
  product: Product
  onCompare?: (p: Product) => void
  selected?: boolean
}) {
  const navigate = useNavigate()
  const [wished, setWished] = useState(false)
  const [tracking, setTracking] = useState(false)

  const TrendIcon = product.trend === "down" ? TrendingDown : product.trend === "up" ? TrendingUp : Minus
  const trendColor = product.trend === "down" ? "text-emerald-600" : product.trend === "up" ? "text-red-500" : "text-slate-400"

  const verdiantMap: Record<string, "success" | "warning" | "info"> = {
    green: "success", amber: "warning", blue: "info"
  }

  return (
    <div
      className={`group relative bg-white rounded-xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer ${
        selected ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200"
      }`}
      onClick={() => navigate(`/product/${product.id}`)}
    >
      {product.discount >= 10 && (
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-emerald-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            {product.discount}% OFF
          </span>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setWished(!wished) }}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors"
      >
        <Heart size={14} className={wished ? "fill-red-500 text-red-500" : "text-slate-400"} />
      </button>

      <div className="p-4">
        <div className="aspect-square w-full overflow-hidden rounded-lg bg-slate-50 mb-3">
          <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>

        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">{product.brand}</p>
        <h3 className="text-sm font-medium text-slate-800 leading-tight line-clamp-2 mb-2">{product.name}</h3>

        <div className="flex items-center gap-1.5 mb-2">
          <div className="flex items-center gap-0.5">
            <Star size={11} className="fill-amber-400 text-amber-400" />
            <span className="text-xs font-semibold text-slate-700">{product.rating}</span>
          </div>
          <span className="text-xs text-slate-400">({product.reviews.toLocaleString("en-IN")})</span>
          <TrendIcon size={12} className={`ml-auto ${trendColor}`} />
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {product.specs.slice(0, 3).map((s, idx) => (
            <span key={idx} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">
              {typeof s === "string" ? s : typeof s === "object" ? JSON.stringify(s) : String(s)}
            </span>
          ))}
        </div>

        <div className="mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900">{fmt(product.bestPrice)}</span>
            <span className="text-sm text-slate-400 line-through">{fmt(product.mrp)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-slate-500">Best at</span>
            <span className="text-xs font-semibold text-slate-700">{product.bestStore}</span>
            <span className="text-xs text-slate-400">+{product.stores - 1} stores</span>
          </div>
        </div>

        <Badge variant={verdiantMap[product.verdictColor] || "neutral"} className="mb-3 text-xs">
          {product.aiVerdict}
        </Badge>

        <div className="flex gap-1.5 pt-2 border-t border-slate-100">
          <button
            onClick={(e) => { e.stopPropagation(); onCompare?.(product) }}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
            }`}
          >
            <GitCompare size={11} />
            Compare
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setTracking(!tracking) }}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tracking ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            <Bell size={11} />
            {tracking ? "Tracking" : "Track"}
          </button>
        </div>
      </div>
    </div>
  )
}
