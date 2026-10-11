import { Heart, GitCompare, Bell, TrendingDown, TrendingUp, Minus, Star } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import Badge from "./Badge"

import type { Product } from "../../types/product"
export type { Product }

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
        <div className="aspect-square w-full overflow-hidden rounded-lg bg-slate-50 mb-3 flex items-center justify-center p-2">
          <img
            src={(() => {
              if (product.image) {
                const spMatch = product.image.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/);
                if (spMatch) {
                  return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-w280-h280/phone.webp`;
                }
                return product.image;
              }
              const b = (product.brand || '').toLowerCase();
              if (b.includes('apple')) return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80';
              if (b.includes('samsung')) return 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80';
              if (b.includes('oneplus')) return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
              if (b.includes('motorola')) return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
              if (b.includes('vivo')) return 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80';
              if (b.includes('realme')) return 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80';
              if (b.includes('oppo')) return 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80';
              return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
            })()}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={(e) => {
              const b = (product.brand || '').toLowerCase();
              if (b.includes('apple')) e.currentTarget.src = 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80';
              else if (b.includes('samsung')) e.currentTarget.src = 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80';
              else if (b.includes('oneplus')) e.currentTarget.src = 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
              else if (b.includes('motorola')) e.currentTarget.src = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
              else if (b.includes('vivo')) e.currentTarget.src = 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80';
              else if (b.includes('realme')) e.currentTarget.src = 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80';
              else if (b.includes('oppo')) e.currentTarget.src = 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80';
              else e.currentTarget.src = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
            }}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
          />
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
          {product.specs.slice(0, 3).map(s => (
            <span key={s} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">{s}</span>
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
