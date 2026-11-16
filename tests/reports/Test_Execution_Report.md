# PriceWise — Test Plan & Test Execution Report

**Project Title**: PriceWise - Compare, Analyze, Shop Smarter (A web-based AI-Powered Smart Shopping Assistant)  
**Course**: WSSOA (IT644) — Autumn 2026, Dhirubhai Ambani University  
**Execution Date**: Monday, 16 November 2026  
**Execution Time**: 9:19:54 pm  
**Target Environment**: Node.js v24.14.1 | TypeScript 5.6 | Prisma ORM | PostgreSQL

---

## 1. Executive Summary & Quality Dashboard

| Metric | Result | Status |
|---|---|---|
| **Total Test Suites** | **8 Suites** | Complete Coverage |
| **Total Test Cases / Assertions** | **44 Tests** | 100% Executed |
| **Passed Tests** | **44 Passed** | All Criteria Met |
| **Failed Tests** | **0 Failed** | Zero Regressions |
| **Overall Pass Rate** | **100.0%** | **PASSED** |
| **Total Execution Duration** | **3.16s** | High Performance |

---

## 2. Test Execution Matrix by Module (Mapped to Specification)

| Test ID | Module | Scenario Tested | Expected Result | Status |
|---|---|---|---|:---:|
| **TC-AUTH-01** | Authentication | Valid registration initiates OTP flow | 6-digit OTP generated & sent; user not committed prematurely to DB | **PASS** |
| **TC-AUTH-02** | Authentication | OTP verification completes account creation | Password stored with bcrypt (salt rounds >= 10); signed JWT returned | **PASS** |
| **TC-AUTH-03** | Authentication | OTP brute-force protection | 5 invalid attempts limit strictly enforced; 5th failure invalidates token | **PASS** |
| **TC-AUTH-04** | Authentication | User login with valid credentials | HTTP 200 with JWT containing correct identity claims (id, email, role) | **PASS** |
| **TC-AUTH-05** | Authentication | IP sliding-window auth rate limiter | 10 consecutive requests pass; 11th request receives HTTP 429 Too Many Requests | **PASS** |
| **TC-PROD-01** | Product Catalog | Paginated catalog listing & filtering | Accurate offset and page boundaries computed across categories | **PASS** |
| **TC-PROD-02** | Product Search | Case-insensitive keyword search | Normalizes query tokens and matches verified catalog items | **PASS** |
| **TC-PROD-03** | Product Comparison | Side-by-side spec comparison matrix | Aligns RAM, CPU, Display, Battery; displays fallback "—" for missing keys | **PASS** |
| **TC-STORE-01** | Store Redirection | Amazon ASIN canonical URL extraction | Validates ASIN pattern and constructs safe destination link | **PASS** |
| **TC-STORE-02** | Store Redirection | Anti-accessory guard (BUG-001) | Blocks phone cases, covers, screen guards from hijacking target phone links | **PASS** |
| **TC-STORE-03** | Store Redirection | Variant conflict resolution | Mismatched storage/color variants safely fall back to brand search page | **PASS** |
| **TC-ALERT-01** | Price Alerts | Drop threshold evaluation | Automatic background trigger when price decreases at or below target | **PASS** |
| **TC-ALERT-02** | Price Alerts | Idempotency locking (BUG-002) | Composite unique key [alertId, triggerPrice] prevents duplicate alert spam | **PASS** |
| **TC-ALERT-03** | Price Alerts | Exponential backoff on SMTP failure | Failed jobs increment attempt count and unlock for timed retry | **PASS** |
| **TC-ALERT-04** | Price Alerts | Back-in-stock restock notification | Out-of-stock to In-stock transition sends 1 alert and re-arms state | **PASS** |
| **TC-ADMIN-01** | Admin & RBAC | Role-based access control enforcement | Non-admin users receiving HTTP 403 Forbidden on all /api/admin endpoints | **PASS** |
| **TC-ADMIN-02** | Admin & RBAC | Self-protection lockout prevention | Administrator cannot demote, suspend, or delete their own active account | **PASS** |
| **TC-ADMIN-03** | Admin Catalog | Product catalog CRUD validation | Required device name, brand, store prices, and stock status validated | **PASS** |
| **TC-ADMIN-04** | Admin Users | User directory moderation | Role promotion (USER <-> ADMIN) and account ban/reactivation toggles | **PASS** |
| **TC-ADMIN-05** | Admin Queue | Notification queue retry & manual cycle | Failed jobs can be re-queued with reset attempt counts; monitor cycle triggers | **PASS** |
| **TC-SEC-01** | Security | Mandatory HTTP security headers | X-Content-Type-Options: nosniff, X-Frame-Options: DENY present | **PASS** |
| **TC-SEC-02** | Security | Bcrypt password security | Enforces minimum salt rounds >= 10 with zero plaintext leakage | **PASS** |
| **TC-SEC-03** | Security | SQL / ORM injection prevention | Parameterized Prisma queries safely neutralize malicious strings (' OR '1'='1) | **PASS** |
| **TC-SEC-04** | Security | Email alert submission abuse prevention | IP-based rate limiting throttles excessive alert creation calls | **PASS** |
| **TC-SEC-05** | Security | XSS protection in user prompts | Raw HTML script tags sanitized and entity-escaped | **PASS** |
| **TC-SEC-06** | Security | Expired JWT session invalidation | Expired token throws TokenExpiredError; client session invalidated | **PASS** |
| **TC-MKT-01** | Market Intelligence | Data provenance & isolation (BUG-004) | Synthetic demo products excluded from market inflation and drop trends | **PASS** |
| **TC-CHAT-01** | AI Assistant | Chat session context scoping | Recommendations bounded to catalog inventory; hallucinated models rejected | **PASS** |
| **TC-ML-01** | Machine Learning | FastAPI /health service readiness | Returns status ok and active cached product model vectors | **PASS** |
| **TC-ML-02** | Machine Learning | BUY signal on All-Time Low price | High confidence BUY signal emitted when price is within 2% of 90-day minimum | **PASS** |
| **TC-ML-03** | Machine Learning | WAIT signal on projected price drop | Emits WAIT signal and calculates potential savings when drop > 5% | **PASS** |
| **TC-ML-04** | Machine Learning | Insufficient data fallback handling | Series < 14 points safely defaults to MONITOR verdict without throwing | **PASS** |
| **TC-ML-05** | Machine Learning | Non-negative price bounds (BUG-003) | Mathematical clamp max(mrp * 0.2, min * 0.7, forecast) bounds predictions >= 0 | **PASS** |
| **TC-ML-06** | Machine Learning | 20% price-shift cache invalidation | Sudden flash sale drops invalidate cache and trigger fresh dynamic inference | **PASS** |
| **TC-ML-07** | Machine Learning | Content-based alternative suggestions | Returns up to 4 same-category alternatives excluding target item | **PASS** |
| **TC-ML-08** | Machine Learning | Missing specs resilience | Empty specs dictionary handled with default vector imputation without crash | **PASS** |
| **TC-UI-01** | Frontend UI | Responsive layout adaptation | Mobile (375px) collapses to hamburger menu; desktop (1440px) shows full bar | **PASS** |
| **TC-UI-02** | Frontend UI | Reactive multi-attribute filtering | Category, price range, and rating filter updates catalog without page reload | **PASS** |
| **TC-UI-05** | Frontend UI | Optimistic state rollback (BUG-005) | Wishlist/Watchlist toggle rolls back on server 409 Conflict | **PASS** |
| **TC-UI-07** | Frontend UI | Admin restricted access 5s countdown | Displays "Admin Not Allowed" card and automatically redirects to home in 5s | **PASS** |
| **TC-UI-08** | Frontend UI | Multi-table pagination controls | Next/Prev buttons, numbered pages, and per-page selector across Admin & Alerts | **PASS** |
| **TC-UI-09** | Frontend UI | Smartprix CDN & no-referrer policy | Resolves cdn1 URLs and adds referrerPolicy="no-referrer" to prevent 403 error | **PASS** |
| **TC-PERF-01..04** | Performance | Latency SLA benchmarks | Catalog response < 250ms (Observed: 15ms), Cached aggregation < 100ms (Observed: 5ms) | **PASS** |
| **TC-REL-01..03** | Reliability | Service offline fallbacks | ML service offline falls back to local linear regression without HTTP 500 | **PASS** |

---

## 3. Defect Remediation & Verification Log

| Defect ID | Severity | Root Cause | Remediation | Verification Status |
|---|:---:|---|---|:---:|
| **BUG-001** | P1 (Critical) | External search broad matching allowed phone cases/accessories to hijack phone buy links. | Added `validateCanonicalProductUrl` and blocked accessory keywords (`cover`, `case`, `protector`). | **VERIFIED CLOSED** |
| **BUG-002** | P1 (Critical) | Minor price fluctuations around target price caused duplicate email alert storm. | Created unique composite constraint `@@unique([alertId, triggerPrice])` with state locking. | **VERIFIED CLOSED** |
| **BUG-003** | P2 (High) | Steep downward regression produced negative forecasted prices on clearance items. | Added boundary floor clamp `max(mrp * 0.20, min_historical * 0.70, raw_forecast)`. | **VERIFIED CLOSED** |
| **BUG-004** | P2 (High) | Seed demo phones leaked into market intelligence trend charts. | Created `dataProvenance.ts` with `SYNTHETIC_PRODUCT_IDS` exclusion pipeline. | **VERIFIED CLOSED** |
| **BUG-005** | P3 (Medium) | Rapid double-click on wishlist caused UI desynchrony with backend 409 Conflict. | Added optimistic state debounce and error rollback handler in `AuthContext.tsx`. | **VERIFIED CLOSED** |
| **BUG-006** | P3 (Medium) | Missing rate limiter on OTP resend allowed inbox spamming. | Attached `authRateLimiter` and enforced strict 60-second cooldown timer between requests. | **VERIFIED CLOSED** |

---

## 4. Conclusion & Sign-Off

The unified automated test suite executed **44 test assertions** across all 8 architectural modules. All functional requirements, newly implemented Admin features, and non-functional performance benchmarks completed with a **100% pass rate**. The PriceWise system is verified stable, resilient, and ready for deployment and presentation.
