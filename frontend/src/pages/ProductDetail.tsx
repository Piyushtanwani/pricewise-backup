import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router"
import {
  Star, Heart, Bell, GitCompare, ExternalLink, Sparkles,
  CheckCircle, ChevronRight, Info, Loader2
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend
} from "recharts"
import Badge from "../components/ui/Badge"
import ProductCard from "../components/ui/ProductCard"
import CompareButton from "../components/ui/CompareButton"
import PriceAlertModal from "../components/ui/PriceAlertModal"
import { api } from "../services/api"
import { useAuth } from "../context/AuthContext"
import type { Product, ProductDetailResponse, StorePriceRow, PricePoint, PredictionPoint } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    isAuthenticated,
    isWishlisted: authIsWishlisted,
    toggleWishlist,
  } = useAuth()

  const [detail, setDetail] = useState<ProductDetailResponse | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [prediction, setPrediction] = useState<PredictionPoint[]>([])
  const [alternatives, setAlternatives] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveStores, setLiveStores] = useState<StorePriceRow[] | null>(null)
  const [liveStoresLoading, setLiveStoresLoading] = useState(false)

  const [timeRange, setTimeRange] = useState("3M")
  const [selectedStore, setSelectedStore] = useState<string>("All Stores")
  const [wished, setWished] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [targetPrice, setTargetPrice] = useState<number>(0)
  const [tab, setTab] = useState<"history" | "prediction">("history")

  // Nodemailer Email Notification Modal State
  const [showNotifyModal, setShowNotifyModal] = useState(false)
  const [modalProduct, setModalProduct] = useState<Product | null>(null)
  const [trackedProductIds, setTrackedProductIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    let isMounted = true

    async function loadProduct() {
      try {
        setLoading(true)
        setError(null)

        // 1. Load core product details first for instant UI render
        const prodDetail = await api.getProduct(id!)
        if (!isMounted) return

        setDetail(prodDetail)
        if (prodDetail.userState) {
          setWished(Boolean(prodDetail.userState.wishlisted))
          const isTracked = Boolean(prodDetail.userState.tracking)
          setTracking(isTracked)
          if (isTracked && id) {
            setTrackedProductIds((prev) => new Set(prev).add(id))
          }
        }
        setLoading(false)

        // 2. Fetch live SerpApi Google Shopping stores (fast background call)
        setLiveStoresLoading(true)
        api.getLiveStores(id!)
          .then((res) => {
            if (isMounted && res.stores && res.stores.length > 0) {
              setLiveStores(res.stores)
            }
          })
          .catch((err) => console.error("Error fetching live stores:", err))
          .finally(() => {
            if (isMounted) setLiveStoresLoading(false)
          })

        // 3. Load history, predictions, and alternatives in background (non-blocking)
        Promise.all([
          api.getProductHistory(id!).catch(() => []),
          api.getProductPrediction(id!).catch(() => []),
          api.getProductAlternatives(id!).catch(() => []),
        ]).then(([historyPoints, predPoints, alts]) => {
          if (!isMounted) return
          if (historyPoints && historyPoints.length > 0) setHistory(historyPoints)
          if (predPoints && predPoints.length > 0) setPrediction(predPoints)
          if (alts && alts.length > 0) setAlternatives(alts)
        })
      } catch (err: any) {
        console.error("Failed to load product details:", err)
        if (isMounted) {
          setError("Product could not be loaded or was not found.")
          setLoading(false)
        }
      }
    }

    loadProduct()
    return () => { isMounted = false }
  }, [id])

  useEffect(() => {
    if (!id || loading) return
    let isMounted = true
    const storeParam = selectedStore === "All Stores" ? undefined : selectedStore
    api.getProductHistory(id, timeRange, storeParam)
      .then((pts) => {
        if (isMounted) setHistory(pts)
      })
      .catch(console.error)
    return () => { isMounted = false }
  }, [id, timeRange, selectedStore, loading])

  useEffect(() => {
    const prod = detail?.product || detail
    if (prod?.bestPrice && targetPrice === 0) {
      setTargetPrice(Math.round(prod.bestPrice * 0.95))
    }
  }, [detail, targetPrice])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
          <p className="text-sm text-slate-500">Loading product details from Supabase...</p>
        </div>
      </div>
    )
  }

  const product = detail?.product || detail

  if (error || !product || !product.id || !product.name) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 max-w-[1440px] mx-auto px-6 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 max-w-lg mx-auto shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Product Not Found</h2>
          <p className="text-slate-500 text-sm mb-6">{error || "The requested smartphone is not available in the catalogue."}</p>
          <button
            onClick={() => navigate("/search")}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Browse All Smartphones
          </button>
        </div>
      </div>
    )
  }

  // Merge verified database stores and auxiliary live stores with database priority
  const dbStores: StorePriceRow[] = detail.storePrices || (Array.isArray(detail.stores) ? (detail.stores as unknown as StorePriceRow[]) : [])
  const storeMap = new Map<string, StorePriceRow>()

  // 1. Verified database listings are ground truth
  for (const s of dbStores) {
    storeMap.set(s.store.toLowerCase(), s)
  }

  // 2. Only add live stores that do not conflict with verified database stores
  if (liveStores && liveStores.length > 0) {
    for (const s of liveStores) {
      const key = s.store.toLowerCase()
      if (!storeMap.has(key)) {
        storeMap.set(key, s)
      }
    }
  }

  let stores: StorePriceRow[] = Array.from(storeMap.values())
  if (stores.length > 0) {
    stores.sort((a, b) => a.price - b.price)
    const lowest = stores[0].price
    stores = stores.map((s) => ({
      ...s,
      diff: Math.max(0, s.price - lowest),
    }))
  } else if (product.bestStore) {
    stores = [{
      storeId: 'default',
      store: product.bestStore,
      storeSlug: product.bestStore.toLowerCase(),
      logoUrl: null,
      price: product.bestPrice,
      mrp: product.mrp || null,
      diff: 0,
      url: (product as any).affiliateUrl || (product as any).url || '',
      availability: 'In Stock',
      shipping: 'Free',
    }]
  }

  const currentBestPrice = stores.length > 0 ? stores[0].price : (product.bestPrice || 0)
  const currentBestStore = stores.length > 0 ? stores[0].store : (product.bestStore || "Amazon")
  const currentMrp = product.mrp && product.mrp > currentBestPrice ? product.mrp : Math.round(currentBestPrice * 1.15)
  const savings = Math.max(0, currentMrp - currentBestPrice)
  const discountPct = Math.round(((currentMrp - currentBestPrice) / currentMrp) * 100)

  const stats = detail.stats
  const verdict = detail.verdict
  const insights = detail.insights || []

  const avgPrice = stats?.average90 || product.bestPrice
  const lowestPrice = stats?.lowestEver || stats?.lowest90 || product.bestPrice
  const highestPrice = stats?.highest90 || product.mrp

  const chartHistoryData = history.length > 0
    ? history
    : product.priceHistory?.length
    ? product.priceHistory.map((p, idx) => ({ date: `Pt ${idx + 1}`, price: p, avg: product.bestPrice }))
    : [{ date: "Current", price: product.bestPrice, avg: product.bestPrice }]

  const currentStoreRow = selectedStore === "All Stores" ? null : stores.find((s) => s.store.toLowerCase() === selectedStore.toLowerCase())
  const selectedCurrentPrice = currentStoreRow ? currentStoreRow.price : product.bestPrice

  const historyPrices = chartHistoryData.map((d) => d.price).filter((p): p is number => typeof p === "number" && p > 0)
  const calcLowest = historyPrices.length > 0 ? Math.min(...historyPrices, selectedCurrentPrice) : lowestPrice
  const calcHighest = historyPrices.length > 0 ? Math.max(...historyPrices, selectedCurrentPrice) : highestPrice
  const calcAvg = historyPrices.length > 0 ? Math.round(historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length) : avgPrice

  const chartPredictionData = prediction.length > 0
    ? prediction
    : [
        { date: "Current", price: product.bestPrice, predicted: product.bestPrice, upper: product.bestPrice, lower: product.bestPrice },
        { date: "7 Days", price: null, predicted: Math.round(product.bestPrice * 0.98), upper: Math.round(product.bestPrice * 1.02), lower: Math.round(product.bestPrice * 0.95) },
        { date: "30 Days", price: null, predicted: Math.round(product.bestPrice * 0.96), upper: Math.round(product.bestPrice * 1.03), lower: Math.round(product.bestPrice * 0.92) },
      ]

  const isDirectProductUrl = (url?: string | null) => {
    if (!url) return false
    return (
      (url.includes("flipkart.com") && (url.includes("/p/") || url.includes("pid="))) ||
      (url.includes("amazon.in") && (url.includes("/dp/") || url.includes("/gp/product/"))) ||
      (url.includes("croma.com") && url.includes("/p/")) ||
      (url.includes("reliancedigital.in") && url.includes("/p/")) ||
      (url.includes("vijaysales.com") && !url.includes("/search"))
    )
  }

  const getDirectBuyUrl = (storeRow?: StorePriceRow) => {
    if (storeRow?.url) {
      let finalUrl = storeRow.url
      // Auto-correct path-based Vijay Sales search URLs to prevent 404
      if (finalUrl.includes("vijaysales.com/search/") && !finalUrl.includes("?q=")) {
        const rawQ = finalUrl.replace(/^https?:\/\/(?:www\.)?vijaysales\.com\/search\//i, "")
        finalUrl = `https://www.vijaysales.com/search?q=${rawQ}`
      }
      if (isDirectProductUrl(finalUrl)) {
        return finalUrl
      }
      if (finalUrl.includes("smartprix.com") || finalUrl.includes("linkredirect.in")) {
        const storeParam = storeRow?.store ? `?store=${encodeURIComponent(storeRow.store)}` : ""
        return `http://localhost:5000/api/products/${product.id}/buy${storeParam}`
      }
      return finalUrl
    }
    const storeParam = storeRow?.store ? `?store=${encodeURIComponent(storeRow.store)}` : ""
    return `http://localhost:5000/api/products/${product.id}/buy${storeParam}`
  }

  const currentModalItem = modalProduct || product

  const openTrackModal = (targetItem?: Product) => {
    const item = targetItem || detail?.product || (detail as any)
    if (!item) return
    setModalProduct(item)
    if (item.bestPrice) {
      setTargetPrice(Math.round(item.bestPrice * 0.95))
    }
    setShowNotifyModal(true)
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
          {["Home", product.category || "Mobiles", product.brand, product.name].map((crumb, i, arr) => (
            <span key={crumb} className="flex items-center gap-1.5">
              {i < arr.length - 1 ? (
                <button
                  onClick={() => i === 0 ? navigate("/") : navigate(`/search?q=${encodeURIComponent(crumb)}`)}
                  className="hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  {crumb}
                </button>
              ) : (
                <span className="text-slate-700 font-medium truncate max-w-xs">{crumb}</span>
              )}
              {i < arr.length - 1 && <ChevronRight size={12} />}
            </span>
          ))}
        </nav>

        {/* Main product section */}
        <div className="grid lg:grid-cols-5 gap-8 mb-8">
          {/* Images */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-3 shadow-sm">
              <div className="aspect-square p-8 flex items-center justify-center bg-slate-50">
                <img
                  src={(() => {
                    if (product.image) {
                      const spMatch = product.image.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/);
                      if (spMatch) {
                        return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-w420-h420/phone.webp`;
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
                  className="max-h-full max-w-full object-contain rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="lg:col-span-3">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-1">{product.brand}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight mb-3">{product.name}</h1>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className={i < Math.floor(product.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200"} />
                ))}
              </div>
              <span className="text-sm font-semibold text-slate-700">{product.rating}</span>
              <span className="text-sm text-slate-400">({product.reviews.toLocaleString("en-IN")} ratings)</span>
            </div>

            {/* Price block */}
            <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 mb-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-4xl font-bold text-slate-900">{fmt(currentBestPrice)}</span>
                    <span className="text-lg text-slate-400 line-through">{fmt(currentMrp)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Save {fmt(savings)}</Badge>
                    <Badge variant="success">{discountPct}% OFF</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-1">Lowest price at</p>
                  <p className="text-sm font-bold text-slate-800">{currentBestStore}</p>
                  <span className="inline-block text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    {stores.length} Verified {stores.length === 1 ? "Store" : "Stores"}
                  </span>
                </div>
              </div>

              {/* Live Current Store Prices Breakdown */}
              <div className="mb-4 pt-3 border-t border-indigo-100/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live Store Prices:
                  </span>
                  <span className="text-[11px] text-slate-400">Current Selling Prices</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stores.length > 0 ? (
                    stores.map((s, idx) => (
                      <a
                        key={s.storeId || s.store || idx}
                        href={getDirectBuyUrl(s)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-xs group ${
                          idx === 0
                            ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{s.store}</span>
                          {idx === 0 ? (
                            <span className="bg-emerald-200 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                              Lowest
                            </span>
                          ) : s.diff > 0 ? (
                            <span className="text-[10px] text-slate-500">
                              +{fmt(s.diff)}
                            </span>
                          ) : null}
                          {isDirectProductUrl(s.url) ? (
                            <span className="bg-sky-100 text-sky-800 text-[9px] px-1 py-0.2 rounded font-semibold" title="Direct verified store product page">
                              Direct Page
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-600 text-[9px] px-1 py-0.2 rounded" title="Store keyword search">
                              Search
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold font-mono text-slate-900">{fmt(s.price)}</span>
                          <ExternalLink size={12} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                        </div>
                      </a>
                    ))
                  ) : (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs col-span-2">
                      <span className="font-bold text-slate-900">{product.bestStore || "Amazon"} Store</span>
                      <span className="text-sm font-bold font-mono text-slate-900">{fmt(product.bestPrice)} Current</span>
                    </div>
                  )}
                </div>
              </div>

              <a
                href={getDirectBuyUrl(stores[0])}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mb-2 shadow-md shadow-indigo-600/20"
              >
                View Best Deal at {stores[0]?.store || product.bestStore || "Amazon"} {isDirectProductUrl(stores[0]?.url) ? "(Direct Listing)" : ""} <ExternalLink size={15} />
              </a>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => openTrackModal(product)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    tracking || (product?.id && trackedProductIds.has(product.id))
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <Bell size={13} className={tracking || (product?.id && trackedProductIds.has(product.id)) ? "fill-emerald-600 text-emerald-600" : ""} />
                  {tracking || (product?.id && trackedProductIds.has(product.id)) ? "Tracking Active" : "Track Price"}
                </button>
                <button
                  onClick={async () => {
                    if (!isAuthenticated) {
                      navigate("/login", { state: { from: `/product/${id}` } })
                      return
                    }
                    try {
                      const next = await toggleWishlist(id!)
                      setWished(next)
                    } catch (err: any) {
                      console.error("Wishlist error:", err?.response?.data?.message || err.message)
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    (id && authIsWishlisted(id)) || wished
                      ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-white text-slate-700 border-slate-200 hover:border-red-300"
                  }`}
                >
                  <Heart size={13} className={(id && authIsWishlisted(id)) || wished ? "fill-red-500" : ""} />
                  Wishlist
                </button>
                <CompareButton
                  product={product}
                  variant="detail"
                />
              </div>
            </div>

            {/* AI Verdict */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Sparkles size={13} className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-emerald-800">PriceWise Intelligence Verdict</p>
                <Badge variant="success" className="ml-auto">High Confidence</Badge>
              </div>
              <p className="text-base font-bold text-emerald-800 mb-1">
                ✓ {verdict?.summary || verdict?.label || product.aiVerdict}
              </p>
              <p className="text-sm text-emerald-700">
                {verdict?.reason || verdict?.explanation || `Current price of ${fmt(product.bestPrice)} is ${product.discount}% lower than estimated retail value. Top price consistency across verified retailers.`}
              </p>
            </div>

            {/* Key specs */}
            <div className="flex flex-wrap gap-2">
              {product.specs?.map((s) => (
                <span key={s} className="text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full shadow-2xs">{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Store Price Comparison Table */}
        <div id="stores" className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-slate-900">Verified Retailers & Live Prices</h2>
            {liveStoresLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-medium">
                <Loader2 size={12} className="animate-spin" />
                <span>Checking live store prices...</span>
              </div>
            ) : liveStores && liveStores.length > 0 ? (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Google Shopping Rates
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3">Store</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3">Price</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden sm:table-cell">Shipping</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden md:table-cell">Availability</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 hidden lg:table-cell">vs Best</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stores.length > 0 ? (
                  stores.map((store, i) => (
                    <tr
                      key={store.storeId || store.store || i}
                      className={`${i === 0 ? "bg-emerald-50/50" : ""} hover:bg-slate-50 transition-colors`}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs">
                            {store.store.charAt(0)}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-800">{store.store}</p>
                            {i === 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Best Price</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-base font-bold ${i === 0 ? "text-emerald-700" : "text-slate-800"}`}>
                          {fmt(store.price)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 hidden sm:table-cell">
                        <span className="text-slate-600">{store.shipping || "Free"}</span>
                      </td>
                      <td className="py-3 pr-4 hidden md:table-cell">
                        <Badge variant={store.availability === "In Stock" ? "success" : "warning"}>
                          {store.availability || "In Stock"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 hidden lg:table-cell">
                        {store.diff > 0 ? (
                          <span className="text-red-500 text-xs font-mono">+{fmt(store.diff)}</span>
                        ) : (
                          <span className="text-emerald-600 text-xs font-mono font-bold">Best</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={getDirectBuyUrl(store)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-indigo-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center gap-1 shadow-sm"
                        >
                          Buy <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-800">{product.bestStore}</td>
                    <td className="py-3 pr-4 font-bold text-emerald-700">{fmt(product.bestPrice)}</td>
                    <td className="py-3 pr-4 text-slate-600">Free</td>
                    <td className="py-3 pr-4"><Badge variant="success">In Stock</Badge></td>
                    <td className="py-3 pr-4 font-bold text-emerald-600">Best</td>
                    <td className="py-3 text-right">
                      <a
                        href={getDirectBuyUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-indigo-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center gap-1"
                      >
                        Buy <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("history")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  tab === "history" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Price History
              </button>
              <button
                onClick={() => setTab("prediction")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  tab === "prediction" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Trend Forecast
              </button>
            </div>

            {tab === "history" && (
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                {["1M", "3M", "6M", "1Y"].map((r) => (
                  <button
                    key={r}
                    onClick={async () => {
                      setTimeRange(r)
                      if (id) {
                        try {
                          const storeParam = selectedStore === "All Stores" ? undefined : selectedStore
                          const pts = await api.getProductHistory(id, r, storeParam)
                          setHistory(pts)
                        } catch (e) {
                          console.error(e)
                        }
                      }
                    }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      timeRange === r ? "bg-white text-indigo-600 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tab === "history" && stores.length > 1 && (
            <div className="flex items-center flex-wrap gap-2 mb-4 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide mr-1 pl-1">
                Store History:
              </span>
              <button
                onClick={() => setSelectedStore("All Stores")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer border ${
                  selectedStore === "All Stores"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold"
                    : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                }`}
              >
                All Stores (Lowest: {fmt(product.bestPrice)})
              </button>
              {stores.map((s) => (
                <button
                  key={s.storeId || s.store}
                  onClick={() => setSelectedStore(s.store)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer border flex items-center gap-1.5 ${
                    selectedStore === s.store
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold"
                      : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  <span>{s.store}:</span>
                  <span className="font-mono">{fmt(s.price)}</span>
                </button>
              ))}
            </div>
          )}

          {tab === "history" ? (
            <>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: selectedStore !== "All Stores" ? `${selectedStore} Lowest` : "Lowest Recorded", value: fmt(calcLowest), color: "text-emerald-700" },
                  { label: selectedStore !== "All Stores" ? `${selectedStore} Highest` : "Highest (90d)", value: fmt(calcHighest), color: "text-red-600" },
                  { label: "Average", value: fmt(calcAvg), color: "text-slate-700" },
                  { label: selectedStore !== "All Stores" ? `${selectedStore} Current` : "Current Best", value: fmt(selectedCurrentPrice), color: "text-indigo-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-2 rounded-xl bg-slate-50">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={chartHistoryData}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={45} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }}
                      formatter={(v) => [typeof v === "number" ? fmt(v) : String(v), "Price"]}
                    />
                    <ReferenceLine y={avgPrice} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "Avg", position: "right", fontSize: 10, fill: "#94a3b8" }} />
                    <Area type="monotone" dataKey="price" stroke="#4f46e5" fill="url(#priceGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <Info size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">Trend forecasts are calculated via deterministic linear regression over verified historical price observations. Not a guaranteed future price.</p>
              </div>
              <div>
                <ResponsiveContainer width="100%" height={256}>
                  <AreaChart data={chartPredictionData}>
                    <defs>
                      <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={45} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }}
                      formatter={(v, name) => [typeof v === "number" && v ? fmt(v) : "—", String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="upper" stroke="none" fill="url(#rangeGrad)" name="Upper estimate" />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="white" name="Lower estimate" />
                    <Area type="monotone" dataKey="price" stroke="#1e3a8a" fill="url(#predGrad)" strokeWidth={2.5} dot={false} name="Actual price" />
                    <Area type="monotone" dataKey="predicted" stroke="#4f46e5" fill="none" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: "#4f46e5" }} name="Predicted price" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        {/* AI Analysis Insights */}
        {insights.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Sparkles size={13} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">AI Intelligence Insights</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {insights.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <CheckCircle size={15} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    {item.label && <p className="text-xs font-semibold text-slate-500">{item.label}</p>}
                    <p className="text-sm font-medium text-slate-800">{item.value || item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Smart Alternatives */}
        {alternatives.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Smart Alternatives in this Budget</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {alternatives.slice(0, 4).map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isTracking={trackedProductIds.has(p.id)}
                  onTrackClick={(targetProduct) => openTrackModal(targetProduct)}
                />
              ))}
            </div>
          </div>
        )}

        {/* =================== Price Alert Nodemailer Modal =================== */}
        <PriceAlertModal
          isOpen={showNotifyModal}
          onClose={() => setShowNotifyModal(false)}
          product={currentModalItem}
          onAlertActivated={(targetId) => {
            setTrackedProductIds((prev) => new Set(prev).add(targetId))
            if (targetId === product.id) {
              setTracking(true)
            }
          }}
        />
      </div>
    </div>
  )
}

