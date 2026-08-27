# Wireframes and UI Breakdown: PriceWise

The UI is split into several main screens:

## 1. Landing Page & Smart Home Dashboard (/Home)
- **Purpose:** Primary entry point, communicate value proposition, instant multi-store product searches, showcase live price monitoring, display trust metrics.
- **Key Components:**
  - **Global Navigation Bar:** Logo, 5 section links, global search (Cmd+K), alerts, wishlist, profile.
  - **Hero Search Section:** Tagline, search input field, category pills.
  - **Live Interactive Preview Card:** Dynamic product card displaying lowest price vs MRP, discount badge, 90-day price trend, AI buy/wait recommendation.
  - **Platform Trust Metrics & Feature Grid:** "Total Products Tracked", "Total Alerts Sent", and 4-column feature pillars (Price Comparison, Tracking, Forecasting, Recommendations).

## 2. User Authentication & Sign-In Page (/login)
- **Purpose:** Split-screen login and onboarding, Google SSO and email/password.
- **Key Components:**
  - **Left Value-Proposition Panel:** Logo, headline, marketing summary, 4 feature bullet blocks with icons.
  - **Right Authentication Form:** Email, password (with show/hide), "Remember me", 'Sign In', 'Continue with Google' OAuth.

## 3. Product Discovery & Catalog Hub (/discover)
- **Purpose:** Explore multi-category catalogs, view trending products, filter by discount.
- **Key Components:**
  - **Category Navigation Carousel:** Horizontal category pills with item count badges (Mobiles, Laptops, Audio, etc).
  - **Product Cards Grid:** 3-column grid with product image, discount tag, wishlist button, brand label, model, rating, specs.
  - **Price & Merchant Badges:** Lowest price, MRP, best store tag, AI recommendation badge.
  - **Card Action Buttons:** 'Compare' and 'Track Price'.

## 4. Side-by-Side Product Comparison Matrix (/compare)
- **Purpose:** Multi-column comparison table (2-4 products) for pricing, merchant availability, ratings, technical specs.
- **Key Components:**
  - **Product Header Row:** Images, 'Best Value' badge, titles, best price, 'View Deal' button.
  - **Pricing Breakdown Section:** Best Price, Original MRP, Discount %, User Rating, Review Counts, Best Store.
  - **Technical Specifications Matrix:** Row-by-row hardware breakdown (Processor, RAM, Storage, Display, Battery). Winning attributes highlighted in soft green.

## 5. Price Intelligence & Predictive Analytics Dashboard (/price-intelligence)
- **Purpose:** Advanced price analytics, historical trendlines, record lows, AI 7/30/60-day price forecasting.
- **Key Components:**
  - **Top Key Metrics Ribbon:** Current Price, Lowest Ever, 90-Day Avg, 90-Day High, 30/90-Day Net Change.
  - **Interactive Price History Chart:** Time-series line chart (Actual Price vs 90-Day Avg line), timeframe filters (7D, 30D, 3M, 6M, 1Y, All).
  - **Market Dynamics Summary Cards:** vs 90-Day Avg %, Volatility score, Record Low, Best Time to Buy indicator.
  - **Predictive Price Forecast Horizon:** 3 machine learning forecast cards (7D, 30D, 60D) with confidence scoring.

## 6. Personalized AI Recommendations ('For You') (/for-you)
- **Purpose:** Discovery feed based on user history, wishlist, and search patterns with explicit rationale banners.
- **Key Components:**
  - **Header & Rationale Banner:** "Recommended for You" and rationale banner (e.g. "Because you viewed Audio Category...").
  - **Curated Product Cards:** Product cards with discount badge, brand, title, rating, specs, best price, AI decision badge.
  - **Quick Action CTAs:** 'Compare' and 'Track Price'.

## 7. Tracked Products & Watchlist Management (/watchlist)
- **Purpose:** Manage active tracking targets, monitor price gaps, modify/pause alert triggers.
- **Key Components:**
  - **Header & Filter Tabs:** All, Near Target, Price Dropped, Target Reached.
  - **Tracked Product Card Rows:** Horizontal cards with image, title, Current Price, Target Price, Distance to Target.
  - **Visual Progress Bar:** Fills from left to right as current price approaches target.
  - **Alert Status & Actions:** 'Edit Target', 'Pause', 'Remove'.

## 8. User Wishlist & Saved Products (/wishlist)
- **Purpose:** Consolidated bookmarking, potential cost savings, historical price movements since added.
- **Key Components:**
  - **Wishlist Summary Metrics:** Saved Products Count, Price Drops Detected, Total Potential Savings.
  - **Saved Product Item Rows:** Thumbnail, title, rating, Current Price, When Added Price, Net Price Change badge (bold green for drops, red for increases).

## 9. Price Drop Alerts & Notification Center (/alerts)
- **Purpose:** Inbox to review price drop events, target-reached milestones, and checkout links.
- **Key Components:**
  - **Alerts Overview Metrics:** Active Alerts, Price Drops, Targets Reached, Cumulative Savings.
  - **Notification List Rows:** Drop icon, title, original price, new price, % drop badge, timestamp.
  - **Direct Checkout CTA:** Prominent 'View Deal' external link button.

## 10. User Profile & Savings Analytics Hub (/profile)
- **Purpose:** Profile overview, lifetime savings metrics, quick navigation shortcuts.
- **Key Components:**
  - **User Profile Hero Banner:** Avatar, name, email, tenure.
  - **Lifetime Key Metrics Grid:** Products Tracked, Wishlist Items, Alerts Received, Total Lifetime Savings.
  - **Recently Viewed Products Feed:** Rolling history of up to 10 most recent items.
