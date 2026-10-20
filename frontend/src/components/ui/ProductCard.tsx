import { Heart, GitCompare, Bell, TrendingDown, TrendingUp, Minus, Star, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import Badge from "./Badge"
import CompareButton from "./CompareButton"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../services/api"
import type { Product } from "../../types/product"

export type { Product }

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

interface ProductCardProps {
  product: Product
  onCompare?: (p: Product) => void
  selected?: boolean
  isWishlisted?: boolean
  isTracking?: boolean
  onWishlistToggle?: (productId: string, newState: boolean) => void
  onTrackToggle?: (productId: string, newState: boolean) => void
  onTrackClick?: (p: Product) => void
}

export default function ProductCard({
  product,
  onCompare,
  selected,
  isWishlisted: isWishlistedProp,
  isTracking: isTrackingProp,
  onWishlistToggle,
  onTrackToggle,
  onTrackClick,
}: ProductCardProps) {
  const navigate = useNavigate()
  const {
    isAuthenticated,
    isWishlisted: authIsWishlisted,
    isTracking: authIsTracking,
    toggleWishlist,
    toggleWatchlist,
  } = useAuth()

  const [wishLoading, setWishLoading] = useState(false)
  const [trackLoading, setTrackLoading] = useState(false)

  const wished = isWishlistedProp !== undefined ? isWishlistedProp : authIsWishlisted(product.id)
  const tracking = isTrackingProp !== undefined ? isTrackingProp : authIsTracking(product.id)

  const handleToggleWishlist = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAuthenticated) {
      navigate("/login", { state: { from: `/product/${product.id}` } })
      return
    }

    setWishLoading(true)
    try {
      const nextState = await toggleWishlist(product.id)
      onWishlistToggle?.(product.id, nextState)
    } catch (err: any) {
      console.error("Failed to toggle wishlist:", err?.response?.data?.message || err.message)
    } finally {
      setWishLoading(false)
    }
  }

  const handleToggleTrack = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAuthenticated) {
      sessionStorage.setItem("pricewise_pending_track", JSON.stringify({
        productId: product.id,
        productName: product.name,
      }))
      navigate("/login", { state: { from: `/product/${product.id}`, pendingTrack: { productId: product.id, productName: product.name } } })
      return
    }

    if (onTrackClick) {
      onTrackClick(product)
      return
    }

    setTrackLoading(true)
    try {
      const nextState = await toggleWatchlist(product.id)
      onTrackToggle?.(product.id, nextState)
    } catch (err: any) {
      console.error("Failed to toggle tracking:", err?.response?.data?.message || err.message)
    } finally {
      setTrackLoading(false)
    }
  }

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

      {/* Wishlist Heart Icon */}
      <button
        type="button"
        onClick={handleToggleWishlist}
        disabled={wishLoading}
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
      >
        <Heart size={14} className={wished ? "fill-red-500 text-red-500" : "text-slate-400 hover:text-slate-600"} />
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
          {product.specs.slice(0, 3).map((s) => (
            <span key={s} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">{s}</span>
          ))}
        </div>

        <div className="mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900">{fmt(product.bestPrice)}</span>
            <span className="text-sm text-slate-400 line-through">{fmt(product.mrp)}</span>
          </div>
          {product.storePrices && product.storePrices.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {product.storePrices.map((st) => (
                <span
                  key={st.store}
                  className={`text-[11px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1 ${
                    st.diff === 0
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  <span>{st.store}:</span>
                  <span className="font-mono">{fmt(st.price)}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold border bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1">
                <span>{product.bestStore || "Amazon"}:</span>
                <span className="font-mono">{fmt(product.bestPrice)}</span>
              </span>
            </div>
          )}
        </div>

        <Badge variant={verdiantMap[product.verdictColor] || "neutral"} className="mb-3 text-xs">
          {product.aiVerdict}
        </Badge>

        <div className="flex gap-1.5 pt-2 border-t border-slate-100">
          <CompareButton
            product={product}
            variant="card"
            active={selected}
            onClick={onCompare ? (e) => { e.stopPropagation(); onCompare(product); } : undefined}
          />
          <button
            type="button"
            onClick={handleToggleTrack}
            disabled={trackLoading}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
              tracking ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            {trackLoading ? <Loader2 size={11} className="animate-spin" /> : <Bell size={11} />}
            {tracking ? "Tracking" : "Track"}
          </button>
        </div>
      </div>
    </div>
  )
}
