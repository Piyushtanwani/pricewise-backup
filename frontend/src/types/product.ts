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
  storeSlug?: string
  logoUrl?: string | null
  price: number
  mrp?: number | null
  shipping?: string
  shippingCost?: number
  availability?: string
  stockStatus?: string
  diff: number
  url: string
  lastCheckedAt?: string
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
  userState?: {
    wishlisted: boolean
    tracking: boolean
    alert: { id: string; targetPrice: number } | null
  } | null
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
  sessionId?: string
  userId?: string
}

export interface MarketPriceDirection {
  cohortSize: number
  cohortDescription: string
  averageChangePercent: number
  medianChangePercent: number
  direction: 'FALLING' | 'RISING' | 'STABLE'
  fallingCount: number
  risingCount: number
  stableCount: number
  fallingPercent: number
  risingPercent: number
  stablePercent: number
  asymmetryExplanation: string
  lastUpdated: string
  trendSeries: Array<{
    date: string
    timestamp: string
    avgPrice: number
    sampleSize: number
  }>
}

export interface VerifiedPriceDrop {
  productId: string
  productName: string
  brand: string
  imageUrl: string | null
  retailer: string
  retailerSlug: string
  currentPrice: number
  previousPrice: number
  absoluteChange: number
  percentageChange: number
  timestamp: string
  lastVerifiedAt: string
  productLink: string
  storeUrl: string
}

export interface RetailerCompetitiveness {
  storeName: string
  storeSlug: string
  activeListingsCount: number
  sharedListingsCount: number
  lowestPriceWins: number
  exclusiveWins: number
  tiedWins: number
  winRatePercent: number
  marketLowestShare: number
  avgPriceDifferenceVsBest: number
  sampleSize: number
  methodologyNote: string
}

export interface VolatilityProduct {
  productId: string
  productName: string
  brand: string
  imageUrl: string | null
  currentPrice: number
  lowestPrice: number
  highestPrice: number
  averagePrice: number
  volatilityPercent: number
  historyPoints: number
  daysCovered: number
  productLink: string
}

export interface VolatilitySummary {
  qualifiedCount: number
  insufficientHistoryCount: number
  minimumRequirements: string
  mostVolatile: VolatilityProduct[]
  mostStable: VolatilityProduct[]
}

export interface BuyingOpportunity {
  productId: string
  productName: string
  brand: string
  imageUrl: string | null
  currentPrice: number
  lowestEver: number
  average90: number
  discountFromAveragePercent: number
  verdictLabel: string
  recommendation: 'BUY'
  predicted30d: number
  confidence: 'High' | 'Moderate' | 'Low'
  bestStore: string
  isNearAllTimeLow: boolean
  productLink: string
  disclaimer: string
}

export interface MarketIntelligenceSummary {
  direction: MarketPriceDirection
  topPriceDrops: VerifiedPriceDrop[]
  retailerCompetitiveness: RetailerCompetitiveness[]
  volatility: VolatilitySummary
  buyingOpportunities: BuyingOpportunity[]
  metadata: {
    totalCatalogProducts: number
    genuineProductsAnalyzed: number
    syntheticProductsExcluded: number
    generatedAt: string
  }
}

