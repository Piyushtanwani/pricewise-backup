import re
import json
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity

class ContentBasedRecommender:
    def __init__(self, catalog_path: Optional[str] = None):
        self.products: List[Dict[str, Any]] = []
        self.product_map: Dict[str, Dict[str, Any]] = {}
        self.feature_matrix: Optional[np.ndarray] = None
        self.similarity_matrix: Optional[np.ndarray] = None
        self.product_index: Dict[str, int] = {}
        self.reverse_index: Dict[int, str] = {}

        if catalog_path:
            self.load_and_fit(catalog_path)

    def _extract_spec_number(self, text: str, pattern: str) -> Optional[float]:
        if not text:
            return None
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                return None
        return None

    def _parse_product_features(self, p: Dict[str, Any]) -> Dict[str, Any]:
        tech_specs = p.get('techSpecs') or {}
        specs_list = p.get('specs') or []
        combined_text = " ".join([str(v) for v in tech_specs.values()] + [str(s) for s in specs_list] + [p.get('name', '')])

        # 1. RAM in GB
        ram = self._extract_spec_number(combined_text, r'(\d+)\s*GB\s*RAM')
        if not ram:
            ram = self._extract_spec_number(combined_text, r'(\d+)\s*GB\s*inbuilt') or 6.0

        # 2. Storage in GB
        storage = self._extract_spec_number(combined_text, r'(\d+)\s*GB\s*(?:storage|inbuilt|ROM)')
        if not storage:
            # Check TB
            tb = self._extract_spec_number(combined_text, r'(\d+)\s*TB')
            storage = tb * 1024 if tb else 128.0

        # 3. Battery in mAh
        battery = self._extract_spec_number(combined_text, r'(\d{3,5})\s*mAh')
        if not battery:
            battery = 5000.0 if p.get('category') == 'Mobiles' else 4000.0

        # 4. Screen Size in inches
        screen = self._extract_spec_number(combined_text, r'(\d+(?:\.\d+)?)\s*(?:inches|inch|\")')
        if not screen:
            screen = 6.5 if p.get('category') == 'Mobiles' else 14.0

        # 5. 5G Capability
        is_5g = 1.0 if re.search(r'\b5g\b', combined_text, re.IGNORECASE) else 0.0

        # 6. Price
        price = float(p.get('bestPrice') or p.get('mrp') or 20000.0)

        return {
            "ram": ram,
            "storage": storage,
            "battery": battery,
            "screen": screen,
            "is_5g": is_5g,
            "price": price,
            "brand": (p.get('brand') or 'generic').lower(),
            "category": p.get('category') or 'Mobiles'
        }

    def load_and_fit(self, catalog_path: str):
        with open(catalog_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        self.products = data.get('products', [])
        self.product_map = {p['id']: p for p in self.products}
        self.product_index = {p['id']: idx for idx, p in enumerate(self.products)}
        self.reverse_index = {idx: p['id'] for idx, p in enumerate(self.products)}

        # Extract features for each product
        parsed_rows = [self._parse_product_features(p) for p in self.products]
        df = pd.DataFrame(parsed_rows)

        # Scale numerical features
        num_cols = ['ram', 'storage', 'battery', 'screen', 'is_5g']
        scaler = MinMaxScaler()
        scaled_num = scaler.fit_transform(df[num_cols])

        # Normalize log-price so high and low price items are compared on proportional value
        log_price = np.log1p(df[['price']].values)
        price_scaler = MinMaxScaler()
        scaled_price = price_scaler.fit_transform(log_price)

        # One-hot encode brands
        brand_dummies = pd.get_dummies(df['brand'], prefix='brand').values

        # Combine into unified feature matrix: specs (weight 1.5) + price (weight 1.2) + brand (weight 0.8)
        self.feature_matrix = np.hstack([
            scaled_num * 1.5,
            scaled_price * 1.2,
            brand_dummies * 0.8
        ])

        # Compute Pairwise Cosine Similarity
        self.similarity_matrix = cosine_similarity(self.feature_matrix)

    def find_alternatives(
        self,
        product_id: str,
        limit: int = 4,
        max_price_ratio: float = 1.3,
        min_price_ratio: float = 0.6
    ) -> List[Dict[str, Any]]:
        """
        Finds the top alternative products for a given product ID.
        Excludes the target product itself and incompatible categories.
        """
        if product_id not in self.product_index or self.similarity_matrix is None:
            return []

        idx = self.product_index[product_id]
        target_product = self.products[idx]
        target_category = target_product.get('category')
        target_price = float(target_product.get('bestPrice') or target_product.get('mrp') or 1.0)
        target_specs = self._parse_product_features(target_product)

        sim_scores = list(enumerate(self.similarity_matrix[idx]))
        # Sort descending by similarity
        sim_scores.sort(key=lambda x: x[1], reverse=True)

        recommendations = []
        for other_idx, score in sim_scores:
            if other_idx == idx:
                continue

            other_p = self.products[other_idx]
            # Must match category
            if other_p.get('category') != target_category:
                continue

            other_price = float(other_p.get('bestPrice') or other_p.get('mrp') or 1.0)
            # Price band sanity check (avoid comparing a ₹10,000 budget phone to a ₹1,40,000 flagship)
            if other_price > target_price * max_price_ratio or other_price < target_price * min_price_ratio:
                continue

            # Generate natural explanation of trade-offs
            other_specs = self._parse_product_features(other_p)
            tradeoffs = []

            price_diff = other_price - target_price
            if price_diff < -1000:
                tradeoffs.append(f"₹{int(abs(price_diff)):,} lower price")
            elif price_diff > 1000:
                tradeoffs.append(f"₹{int(price_diff):,} premium")

            if other_specs['ram'] > target_specs['ram']:
                tradeoffs.append(f"+{int(other_specs['ram'] - target_specs['ram'])}GB RAM")
            elif other_specs['ram'] < target_specs['ram']:
                tradeoffs.append(f"-{int(target_specs['ram'] - other_specs['ram'])}GB RAM")

            if other_specs['storage'] > target_specs['storage']:
                tradeoffs.append(f"+{int(other_specs['storage'] - target_specs['storage'])}GB Storage")

            if other_specs['battery'] > target_specs['battery'] + 400:
                tradeoffs.append("Larger battery")

            if other_specs['is_5g'] and not target_specs['is_5g']:
                tradeoffs.append("Adds 5G connectivity")

            explanation = ", ".join(tradeoffs) if tradeoffs else "Comparable performance and value tier"

            recommendations.append({
                "product_id": other_p['id'],
                "name": other_p['name'],
                "brand": other_p['brand'],
                "best_price": other_price,
                "rating": other_p.get('rating', 0.0),
                "similarity_score": round(float(score), 3),
                "tradeoff_explanation": explanation
            })

            if len(recommendations) >= limit:
                break

        return recommendations
