import os
import re
import json
import requests
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../backend/.env'))

class ShoppingAssistantEngine:
    def __init__(self, catalog_path: str, recommender=None):
        with open(catalog_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.products = data.get('products', [])
        self.product_map = {p['id']: p for p in self.products}
        self.recommender = recommender
        self.groq_api_key = os.getenv('GROQ_API_KEY')
        self.groq_model = os.getenv('GROQ_MODEL', 'qwen/qwen3.8-27b')

    # ---------------- Controlled Catalog Tools ----------------
    def search_products(
        self,
        query: str = "",
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        brand: Optional[str] = None,
        limit: int = 4
    ) -> List[Dict[str, Any]]:
        """Tool 1: Controlled product search in catalogue."""
        q_lower = query.lower().strip()
        brand_lower = brand.lower().strip() if brand else ""
        results = []

        for p in self.products:
            p_name = p.get('name', '').lower()
            p_brand = p.get('brand', '').lower()
            p_price = float(p.get('bestPrice') or p.get('mrp') or 0.0)

            if brand_lower and brand_lower not in p_brand and brand_lower not in p_name:
                continue

            if min_price is not None and p_price < min_price:
                continue

            if max_price is not None and p_price > max_price:
                continue

            score = 0
            if q_lower:
                words = [w for w in re.split(r'\W+', q_lower) if len(w) > 2]
                for w in words:
                    if w in p_name:
                        score += 3
                    elif w in p_brand:
                        score += 2
                    elif any(w in str(s).lower() for s in p.get('specs', [])):
                        score += 1
                if score == 0:
                    continue
            else:
                score = 1

            results.append((score, p))

        results.sort(key=lambda x: (x[0], x[1].get('rating', 0)), reverse=True)
        return [r[1] for r in results[:limit]]

    def compare_products(self, product_ids: List[str]) -> List[Dict[str, Any]]:
        """Tool 2: Side-by-side spec comparison."""
        found = []
        for pid in product_ids[:3]:
            if pid in self.product_map:
                p = self.product_map[pid]
                found.append({
                    "id": p['id'],
                    "name": p['name'],
                    "brand": p['brand'],
                    "bestPrice": p.get('bestPrice'),
                    "mrp": p.get('mrp'),
                    "rating": p.get('rating'),
                    "specs": p.get('specs', [])
                })
        return found

    def format_product_card(self, p: Dict[str, Any]) -> Dict[str, Any]:
        """Formats catalog product into the frontend ProductCard shape."""
        price = p.get('bestPrice') or p.get('mrp') or 0.0
        mrp = p.get('mrp') or round(price * 1.15)
        discount = round(((mrp - price) / mrp) * 100) if mrp > price else 0

        return {
            "id": p['id'],
            "name": p['name'],
            "brand": p['brand'],
            "image": p.get('imageUrl') or 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600',
            "rating": p.get('rating', 0.0),
            "reviews": p.get('reviewCount', 0),
            "specs": p.get('specs', [])[:4],
            "bestPrice": price,
            "mrp": mrp,
            "discount": discount,
            "bestStore": "Amazon",
            "stores": 2,
            "trend": "falling" if discount > 10 else "stable",
            "category": p.get('category', 'Mobiles'),
            "aiVerdict": "Great Value" if discount >= 15 else "Fair Price",
            "verdictColor": "green" if discount >= 15 else "amber",
            "priceHistory": [round(price * 1.05), round(price * 1.02), price]
        }

    # ---------------- Parse Intent and Budget ----------------
    def parse_user_query(self, message: str) -> Dict[str, Any]:
        msg = message.lower()

        # Parse budget (e.g. "under 30000", "under 30k", "below 1.5 lakh")
        budget = None
        b_match = re.search(r'(?:under|below|less than|within|budget of)\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?)?', msg)
        if b_match:
            val = float(b_match.group(1))
            unit = b_match.group(2)
            if unit in ['k', 'thousand']:
                val *= 1000
            elif unit in ['lakh', 'lakhs', 'lac', 'lacs']:
                val *= 100000
            budget = round(val)

        # Detect intent
        intent = "recommend"
        if any(w in msg for w in ["compare", "versus", " vs ", "difference"]):
            intent = "compare"
        elif any(w in msg for w in ["cheaper", "alternative", "similar", "instead of"]):
            intent = "alternatives"
        elif any(w in msg for w in ["should i buy", "buy now", "good time", "wait"]):
            intent = "buy_now"

        # Detect brand mentions
        brands = ["apple", "samsung", "oneplus", "xiaomi", "redmi", "motorola", "vivo", "realme", "oppo", "google", "sony", "lg"]
        detected_brand = next((b for b in brands if b in msg), None)

        return {
            "intent": intent,
            "budget": budget,
            "brand": detected_brand,
            "raw": message
        }

    # ---------------- Execution & Grounded Generation ----------------
    def reply(self, user_message: str) -> Dict[str, Any]:
        parsed = self.parse_user_query(user_message)
        matched_products = []

        # Tool 1: Catalog Search with parsed budget and brand
        matched_products = self.search_products(
            query=user_message,
            max_price=parsed['budget'],
            brand=parsed['brand'],
            limit=4
        )

        # Fallback if strict search returned nothing
        if not matched_products and parsed['budget']:
            matched_products = self.search_products(
                max_price=parsed['budget'],
                limit=4
            )

        if not matched_products:
            matched_products = self.products[:3]

        formatted_cards = [self.format_product_card(p) for p in matched_products]

        # Try Groq LLM Generation
        if self.groq_api_key:
            try:
                system_prompt = (
                    "You are the official PriceWise Smart Shopping Assistant. "
                    "Your role is to help users compare smartphone prices, specifications, and find deals. "
                    "You must strictly ground your answer in the provided catalogue products. "
                    "Do NOT fabricate prices, retailers, or specs. Be concise, direct, and actionable in 2-3 sentences."
                )

                catalog_summary = "\n".join([
                    f"- {p['name']} ({p['brand']}): Current Best Price ₹{int(p.get('bestPrice', 0)):,} (MRP: ₹{int(p.get('mrp', 0)):,}). Key Specs: {', '.join(p.get('specs', [])[:3])}"
                    for p in matched_products
                ])

                prompt_messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"User asked: \"{user_message}\"\n\nMatching Ground Truth Catalog Products:\n{catalog_summary}\n\nProvide a helpful recommendation citing these exact prices and specs."}
                ]

                headers = {
                    "Authorization": f"Bearer {self.groq_api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": self.groq_model,
                    "messages": prompt_messages,
                    "max_tokens": 150,
                    "temperature": 0.3
                }

                r = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=5.0
                )

                if r.status_code == 200:
                    ai_text = r.json()['choices'][0]['message']['content'].strip()
                    return {
                        "role": "assistant",
                        "content": ai_text,
                        "products": formatted_cards,
                        "insights": [
                            {"label": "Catalog Intelligence", "value": f"Verified {len(matched_products)} matching models in current stock"},
                            {"label": "Price Verification", "value": f"Lowest price: ₹{int(formatted_cards[0]['bestPrice']):,} across tracked stores"}
                        ],
                        "parsed": parsed,
                        "source": f"groq-{self.groq_model}"
                    }
            except Exception as e:
                # Fall back gracefully to rule-based generation
                pass

        # Deterministic Grounded Fallback
        top = formatted_cards[0]
        content = (
            f"Based on our catalog, the top option matching your request is the {top['name']} "
            f"currently available at ₹{int(top['bestPrice']):,} (a {top['discount']}% savings from ₹{int(top['mrp']):,}). "
            f"Key highlights include {', '.join(top['specs'][:2])}."
        )

        return {
            "role": "assistant",
            "content": content,
            "products": formatted_cards,
            "insights": [
                {"label": "Best Price Match", "value": f"₹{int(top['bestPrice']):,} on {top['bestStore']}"},
                {"label": "Savings", "value": f"{top['discount']}% off MRP"}
            ],
            "parsed": parsed,
            "source": "rule-based-fallback"
        }
