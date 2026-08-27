# Instructions for LLMs on PriceWise Project

You are an AI assistant helping to build **PriceWise**, an AI-powered smart shopping assistant. This document provides the context of the project.

## Context
PriceWise combines product discovery, price comparison, historical trends, AI-based price prediction, and personalized recommendations.

## Tech Stack
- **Frontend:** React.js, Tailwind CSS, Shadcn/UI, Recharts
- **Backend:** Node.js, Python (FastAPI for ML)
- **Database:** PostgreSQL, Redis
- **AI/ML:** Python, Pandas, Scikit-learn, Prophet / XGBoost
- **APIs:** Flipkart Affiliate, Amazon PA-API, Custom scrapers.

## Key Subsystems
1. **Product Identity Matching:** Matches products across stores using attribute normalization, deterministic (GTIN/UPC), and fuzzy semantic matching.
2. **Price Notification System:** Uses BullMQ jobs to check prices and notify users via SendGrid/FCM when target prices are met.
3. **Price Intelligence & ML:** Collects historical prices and predicts future trends, generating 'Buy', 'Wait', or 'Monitor' recommendations.

## Roles and Responsibilities
The team consists of 8 members:
- **Piyush Tanwani:** AI/ML Engineer & DB Architect. Focuses on the price-prediction model.
- **Divyesh Dandwani:** Frontend Lead & Backend API Integrator. Owns UI build and search/compare APIs.
- **Diya Jain:** Backend Support, API Testing & Documentation. Handles Postman tests, API docs, integration testing.
- **Vivek Dhanwani:** Data Engineer. Builds scrapers, data collection scripts, and price APIs integration.
- **Yash Gangwani:** Auth & Recommendation Engine Developer. Handles User Management and the AI Recommendation Engine.
- **Aman Rohera:** Backend & External API Integration Specialist. Connects Flipkart/Amazon APIs and search logic.
- **Harshil Dodwani:** UI/UX Designer & Frontend-AI Integration. Owns visual design and AI data visualization on the UI.
- **Priya Shah:** QA Lead & AI Model Testing. Tests ML models and overall platform stability.

## Actionable Guidelines
- When generating code, use the designated technology stack.
- Follow the specific UI/UX mockups referenced in the `Wireframes_and_UI.md` document for all frontend components.
- Make sure to consider the API contracts between Node.js backend and FastAPI ML service.
- Keep performance and scalability in mind, using caching (Redis) where appropriate.
