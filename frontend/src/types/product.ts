export interface Product {
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
  storePrices?: { store: string; price: number; diff: number; url?: string }[]
}

export interface CatalogMeta {
  categories: { name: string; count: number }[]
  brands: { name: string; count: number }[]
  stores: { id: string; name: string; slug: string; url: string; logoUrl: string | null }[]
  priceRange: { min: number; max: number }
}

export interface StorePriceRow {
  storeId: string
  store: string
  storeSlug: string
  logoUrl: string | null
  price: number
  mrp: number | null
  shipping: string
  shippingCost: number
  availability: string
  stockStatus: string
  diff: number
  url: string
  lastCheckedAt: string
}

export interface PricePoint {
  date: string
  price: number
  avg?: number
}

export interface PredictionPoint {
  date: string
  price: number | null
  predicted: number
  upper: number
  lower: number
}

export interface ProductDetailResponse {
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
  stores?: number
  storePrices?: StorePriceRow[]
  trend: string
  aiVerdict: string
  verdictColor: string
  category: string
  priceHistory: number[]
  description?: string | null
  techSpecs?: Record<string, string>
  savings?: number
  product?: Product
  stats?: {
    current: number
    lowestEver: number | null
    average90: number | null
    highest90: number | null
    lowest90?: number | null
    change30Percent?: number
  }
  verdict?: {
    label?: string
    recommendation: string
    reason?: string
    color: string
    summary?: string
    explanation?: string
    confidence?: string
  }
  insights?: { type?: string; label?: string; value?: string; text?: string }[]
}

export interface PriceIntelligenceResponse {
  product: Product
  stores: string[]
  stats: {
    current: number
    lowestEver: number | null
    average90: number | null
    highest90: number | null
    change30Percent: number
  }
  history: PricePoint[]
  prediction: PredictionPoint[]
}

export interface AIChatResponse {
  role: 'assistant'
  content: string
  products?: Product[]
  insights?: { label: string; value: string }[]
}
