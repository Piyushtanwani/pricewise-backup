# PriceWise - Compare, Analyze, Shop Smarter
**A web-based AI-Powered Smart Shopping Assistant**

## Description
PriceWise Shopping Intelligence Platform is an AI-powered platform designed to improve the online shopping experience by combining product discovery, comparison, price intelligence, and personalized shopping insights in a single platform.

With the rapid growth of e-commerce, users often find it difficult to choose the right product from thousands of available options across multiple online stores. They need to manually visit different platforms to compare specifications, check prices, analyze reviews, and track price changes. This process is time-consuming and does not always provide enough information to make an informed choice.

PriceWise solves this problem by providing a unified platform where users can search products, explore detailed specifications, compare similar products, and view prices from multiple stores such as Amazon, Flipkart, Croma, and other available sources. The platform also maintains historical price data and provides interactive price trend analysis to help users understand product pricing patterns.

Using Artificial Intelligence and Machine Learning, PriceWise provides advanced features such as future price prediction, personalized product recommendations, smart alternative suggestions, and price-drop alerts. These features help users discover suitable products, identify better deals, and gain meaningful insights before purchasing.

The goal of PriceWise is to transform traditional online shopping into a smarter, data-driven experience by combining product comparison, market analysis, and AI-powered recommendations on a single platform.

## Motivation / Problem Statement

### Problem Statement
The rapid growth of e-commerce has made online shopping more convenient but has also increased the complexity of choosing the right product. Users have access to thousands of products across multiple platforms, making it difficult to compare options and identify the best choice.

Currently, users need to manually visit different websites to:
- Search for products across multiple platforms.
- Compare product specifications and features.
- Check prices from different online stores.
- Analyze whether the current price is reasonable.
- Track historical price changes.
- Find better alternatives within their budget.

This process is time-consuming and often requires users to collect information from multiple sources before making a purchase decision. Existing shopping platforms mainly focus on selling products and provide limited insights about price trends, future price changes, and personalized recommendations.

### Motivation
The motivation behind PriceWise is to create a unified platform that simplifies the online shopping process by combining product information, price comparison, historical analysis, and AI-powered insights in one place.

The platform aims to:
- Reduce the effort required to research products across multiple websites.
- Help users compare products based on features, specifications, and prices.
- Provide insights into price trends and possible future price movements.
- Recommend suitable products based on user preferences and requirements.
- Help users discover better alternatives and available deals.

By combining data analytics and machine learning, PriceWise aims to make online shopping more intelligent, transparent, and efficient.

## Application Type
**Category:** Web Application

Reasons for Choosing Web Application:
- **Easy Accessibility:** Users can access PriceWise through any web browser without installing additional software.
- **Better Data Visualization:** The platform involves displaying product comparisons, price trends, historical graphs, and analytical insights, which can be effectively represented through a web interface.
- **Cross-Platform Support:** Users can access the application from different devices such as laptops, tablets, and smartphones.
- **Easy Maintenance and Updates:** New features, improvements, and updates can be deployed easily without requiring users to manually update the application.
- **Scalability:** The web architecture allows smooth integration with backend services, databases, and AI/ML models as the platform expands.
- **Integration Capability:** The application can easily connect with external APIs, data sources, notification systems, and machine learning services.

## Scope and High-Level Features
The system reduces the need to visit multiple shopping websites by bringing product details, price comparison, historical trends, and recommendations together in one place.

### High-Level Features:
1. **Product Discovery**
   - Search products by name, category, and brand.
   - View specifications, images, and ratings.
2. **Product Comparison**
   - Compare products based on features, specifications, and prices.
   - Highlight key differences between products.
3. **Price Intelligence**
   - Compare prices across multiple stores.
   - Track historical price trends using graphs.
4. **AI-Powered Insights**
   - Predict future price trends.
   - Provide smart recommendations and alternative product suggestions.
5. **User Personalization**
   - Wishlist and watchlist management.
   - Personalized recommendations based on user preferences.
6. **Price Alerts**
   - Notify users about price drops and better deals.
7. **Data Analytics**
   - Analyze product and pricing data to generate useful shopping insights.

## Target Users and Use Cases

### Target Users
- **Online Shoppers:** Search products, compare options, check prices, and find better deals before purchasing.
- **Budget-Conscious Users:** Discover products within budget and find cost-effective alternatives.
- **Students & Professionals:** Find suitable products based on requirements such as performance, features, and price.
- **Technology Enthusiasts:** Track new products, analyze price trends, and monitor market changes.

### Use Cases
- **Product Search:** Search products using name, category, and brand filters.
- **Product Comparison:** Compare specifications, features, ratings, and prices of multiple products.
- **Price Comparison:** Compare prices across different online stores to find better deals.
- **Price Analysis:** View historical price trends and analyze price changes.
- **AI Insights:** Get price predictions, recommendations, and smart alternatives.
- **Price Alerts:** Receive notifications when product prices drop or reach the desired value.

## Technology Stack
- **Frontend:** React.js, Tailwind CSS, Shadcn/UI, Recharts / Chart.js
- **Backend:** Node.js / Python
- **Database:** PostgreSQL
- **Cache:** Redis
- **AI/ML:** Python, Pandas, NumPy, Scikit-learn, Prophet / XGBoost
- **ML API Service:** FastAPI
- **Authentication:** JWT, Google OAuth (Optional)
- **API Communication:** REST APIs, Axios
- **Deployment:** Vercel (Frontend), Render / Railway / AWS (Backend & ML Service), Neon PostgreSQL (Database)
- **Version Control:** Git, GitHub

## Roles and Responsibilities
- **Frontend Development & UI Implementation:** Divyesh Dandwani, Harshil Dodwani
- **Backend Development & API Integration:** Diya Jain, Aman Rohera, Divyesh Dandwani
- **AI/ML Development & Recommendation System:** Piyush Tanwani, Priya Shah, Yash Gangwani, Harshil Dodwani
- **Authentication & User Management:** Yash Gangwani, Diya Jain
- **Database Design & Management:** Piyush Tanwani, Vivek Dhanwani
- **Data Collection & External API Integration:** Vivek Dhanwani, Aman Rohera
- **Testing, Documentation & Deployment:** Diya Jain, Harshil Dodwani, Priya Shah

---

## Architecture & Current Implementation

PriceWise is built with a decoupled architecture focusing on data integrity, auditability, and speed:

1. **Frontend (Vite + React 19 + TypeScript + Tailwind CSS)**:
   - Centralized authentication & persistence state (`AuthContext.tsx`) managing tokens, user session restoration, optimistic wishlist/watchlist toggling, and rollback.
   - Server-side search & filtering (`Search.tsx`) supporting search keywords (`q`), brand/store filters, price range, minimum rating, sorting, and pagination without client-side artificial caps.
   - Dedicated user modules: `Wishlist.tsx`, `Watchlist.tsx`, `Alerts.tsx`, `Profile.tsx`, `Settings.tsx`, and `ForYou.tsx` (deterministic deal & category-based discovery).
   - Real-time notification center in `Navbar.tsx` with unread count and mark-as-read API integration.

2. **Backend (Node.js + Express 5 + TypeScript + Prisma ORM)**:
   - Secure REST API with strict input validation, security headers (`nosniff`, `DENY`, `XSS`), and IP-based sliding-window rate limiting (`authRateLimiter`, `emailAlertRateLimiter`).
   - Pure PostgreSQL database hosted on Supabase containing normalized tables: `Product`, `Store`, `ProductStore`, `PriceHistory`, `User`, `Wishlist`, `Watchlist`, `Alert`, and `Notification`.
   - Strict retailer domain whitelisting in `serpShoppingService.ts` (Amazon, Flipkart, Croma, Vijay Sales, and official brand stores; rejecting untrusted or refurbished stores).
   - Price tracking & alert engine in `alertEngine.ts` evaluating recorded prices, triggering target notifications, and preventing duplicate alerts.
   - Deterministic linear regression trend forecasting in `priceAnalytics.ts` with honest labeling.

---

## Local Setup & Run Instructions

### Prerequisites
- Node.js v20+
- PostgreSQL or Supabase account
- npm

### 1. Environment Configuration

**Backend Configuration (`backend/.env`):**
Copy `backend/.env.example` to `backend/.env` and supply your variables:
```env
PORT=5000
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
JWT_SECRET="your-256-bit-jwt-secret"
JWT_EXPIRES_IN="7d"
CORS_ORIGIN="http://localhost:5173"
ADMIN_API_KEY="optional-admin-key"
# Email Alerts (Optional)
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="your-app-password"
# External Price Search (Optional)
SERPAPI_KEY="your-serpapi-key"
```

**Frontend Configuration (`frontend/.env`):**
Copy `frontend/.env.example` to `frontend/.env`:
```env
VITE_API_BASE_URL="http://localhost:5000/api"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

### 2. Backend Installation & Startup
```bash
cd backend
npm install
npm run build
npm run dev
```
The backend starts on `http://localhost:5000`. Health check endpoint: `GET http://localhost:5000/api/health`.

### 3. Frontend Installation & Startup
```bash
cd frontend
npm install
npm run build
npm run dev
```
The frontend starts on `http://localhost:5173`.

---

## Verification & Automated Testing

### Backend Unit & Integration Tests
Run all 43 automated tests covering authentication, rate limiting, security headers, search parameters, alert evaluations, and retailer normalization:
```bash
cd backend
npm test
```

### Backend Typecheck & Build
```bash
cd backend
npm run typecheck
npm run build
```

### Frontend Linting & Production Build
```bash
cd frontend
npm run lint
npm run build
```

