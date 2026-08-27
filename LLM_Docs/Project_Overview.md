# Project Overview: PriceWise

## Project Title
PriceWise - Compare, Analyze, Shop Smarter (A web-based AI-Powered Smart Shopping Assistant)

## Description
PriceWise is an AI-powered platform designed to improve the online shopping experience by combining product discovery, comparison, price intelligence, and personalized shopping insights in a single platform. It provides a unified platform where users can search products, explore detailed specifications, compare similar products, and view prices from multiple stores such as Amazon, Flipkart, Croma, and other sources.

## Problem Statement
Consumers face challenges such as fragmented information, lack of historical context, difficulty predicting price movement, time-consuming research, and decision uncertainty.

## Motivation & Objectives
The platform aims to:
- Provide users with centralized product discovery and comparison.
- Reduce the time required to research products across multiple sources.
- Enable users to compare prices from supported sources.
- Provide historical price information for better purchasing context.
- Visualize price trends and use machine learning to estimate potential future price trends.
- Provide actionable Buy, Wait, or Monitor recommendations.
- Allow users to maintain a personal watchlist and configure target-price alerts.

## High-Level Features
1. **Product Discovery:** Search products by name, category, brand, filter and sort.
2. **Product Comparison:** Compare features, specifications, and prices.
3. **Price Intelligence:** Compare prices across multiple stores, track historical price trends using graphs.
4. **AI-Powered Insights:** Predict future price trends, provide smart recommendations and alternative product suggestions.
5. **User Personalization:** Wishlist and watchlist management, personalized dashboard.
6. **Price Alerts:** Notify users about price drops and better deals.
7. **Data Analytics:** Analyze product and pricing data to generate useful shopping insights.

## Technology Stack
- **Frontend:** React.js, Tailwind CSS, Shadcn/UI, Recharts / Chart.js
- **Backend:** Node.js / Python
- **Database:** PostgreSQL
- **Cache / Queue:** Redis, BullMQ
- **AI/ML:** Python, Pandas, NumPy, Scikit-learn, Prophet / XGBoost
- **ML API Service:** FastAPI
- **Authentication:** JWT, Google OAuth (optional)
- **External APIs:** Flipkart Affiliate API, Amazon PA-API 5.0, compliant scraping service for other stores
- **Notifications:** SendGrid / Nodemailer, Firebase Cloud Messaging (optional)
- **Deployment:** Vercel (Frontend), Render / Railway / AWS (Backend & ML Service), Neon PostgreSQL (Database)
