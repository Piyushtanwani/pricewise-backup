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
        self.scaler: Optional[MinMaxScaler] = None
        self.price_scaler: Optional[MinMaxScaler] = None
        self.brand_columns: List[str] = []
        self.brand_index: Dict[str, int] = {}

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

        # Priority 1: Check combo RAM + Storage pattern (e.g. "8GB RAM + 128GB", "8GB / 128GB", "12GB + 256GB")
        ram: Optional[float] = None
        storage: Optional[float] = None

        combo = re.search(r'(\d+)\s*GB\s*(?:RAM)?\s*(?:\+|/|\,)\s*(\d+)\s*GB', combined_text, re.IGNORECASE)
        if combo:
            v1, v2 = float(combo.group(1)), float(combo.group(2))
            # Smartphone RAM is <= 24GB, Storage is typically >= 64GB
            if v1 <= 32 and v2 >= 32:
                ram, storage = v1, v2
            elif v2 <= 32 and v1 >= 32:
                ram, storage = v2, v1

        # Priority 2: Dedicated RAM patterns
        if not ram:
            ram = self._extract_spec_number(combined_text, r'(\d+)\s*GB\s*RAM')
        if not ram:
            ram = self._extract_spec_number(combined_text, r'\bRAM\s*:\s*(\d+)\s*GB')
        if not ram:
            # Standalone RAM candidates (4, 6, 8, 12, 16, 24)
            c = self._extract_spec_number(combined_text, r'\b(4|6|8|12|16|24)\s*GB\b')
            ram = c if c else (8.0 if p.get('category') == 'Mobiles' else 16.0)

        # Priority 3: Storage in GB
        if not storage:
            # Check TB first
            tb = self._extract_spec_number(combined_text, r'(\d+)\s*TB')
            if tb:
                storage = tb * 1024.0
            else:
                storage = self._extract_spec_number(combined_text, r'(\d+)\s*GB\s*(?:storage|inbuilt|ROM)')
        if not storage:
            storage = self._extract_spec_number(combined_text, r'\b(64|128|256|512)\s*GB\b') or 128.0

        # Battery in mAh
        battery = self._extract_spec_number(combined_text, r'(\d{3,5})\s*mAh')
        if not battery:
            battery = 5000.0 if p.get('category') == 'Mobiles' else 4000.0

        # Screen Size in inches
        screen = self._extract_spec_number(combined_text, r'(\d+(?:\.\d+)?)\s*(?:inches|inch|\")')
        if not screen:
            screen = 6.5 if p.get('category') == 'Mobiles' else 14.0

        # 5G Capability
        is_5g = 1.0 if re.search(r'\b5g\b', combined_text, re.IGNORECASE) else 0.0

        # Price
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
        self.scaler = MinMaxScaler()
        scaled_num = self.scaler.fit_transform(df[num_cols])

        # Normalize log-price so high and low price items are compared on proportional value
        log_price = np.log1p(df[['price']].values)
        self.price_scaler = MinMaxScaler()
        scaled_price = self.price_scaler.fit_transform(log_price)

        # One-hot encode brands
        brand_df = pd.get_dummies(df['brand'], prefix='brand')
        self.brand_columns = list(brand_df.columns)
        self.brand_index = {col: i for i, col in enumerate(self.brand_columns)}
        brand_dummies = brand_df.values

        # Combine into unified feature matrix: specs (weight 1.5) + price (weight 1.2) + brand (weight 0.8)
        self.feature_matrix = np.hstack([
            scaled_num * 1.5,
            scaled_price * 1.2,
            brand_dummies * 0.8
        ])

        # Compute Pairwise Cosine Similarity
        self.similarity_matrix = cosine_similarity(self.feature_matrix)

    def transform_single_product(self, p: Dict[str, Any]) -> np.ndarray:
        """Transforms a dynamic product outside the precomputed catalog into the shared feature space."""
        feats = self._parse_product_features(p)
        num_vec = np.array([[feats['ram'], feats['storage'], feats['battery'], feats['screen'], feats['is_5g']]])
        scaled_num = self.scaler.transform(num_vec) if self.scaler else num_vec

        log_p = np.array([[np.log1p(feats['price'])]])
        scaled_p = self.price_scaler.transform(log_p) if self.price_scaler else log_p

        brand_key = f"brand_{feats['brand']}"
        brand_vec = np.zeros((1, len(self.brand_columns)))
        if brand_key in self.brand_index:
            brand_vec[0, self.brand_index[brand_key]] = 1.0

        return np.hstack([scaled_num * 1.5, scaled_p * 1.2, brand_vec * 0.8])

    def find_alternatives(
        self,
        product_id: str,
        limit: int = 4,
        max_price_ratio: float = 1.3,
        min_price_ratio: float = 0.6,
        candidate_product: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Finds the top alternative products for a given product ID.
        Supports both precomputed index items and newly discovered candidate products on-the-fly.
        """
        if self.feature_matrix is None:
            return []

        target_idx: Optional[int] = None
        target_product: Dict[str, Any]

        if product_id in self.product_index:
            target_idx = self.product_index[product_id]
            target_product = self.products[target_idx]
            sim_vector = self.similarity_matrix[target_idx] if self.similarity_matrix is not None else cosine_similarity(
                self.feature_matrix[target_idx:target_idx+1], self.feature_matrix
            )[0]
        elif candidate_product:
            target_product = candidate_product
            target_vec = self.transform_single_product(candidate_product)
            sim_vector = cosine_similarity(target_vec, self.feature_matrix)[0]
        else:
            return []

        target_category = target_product.get('category') or 'Mobiles'
        target_price = float(target_product.get('bestPrice') or target_product.get('mrp') or 1.0)
        target_specs = self._parse_product_features(target_product)

        sim_scores = list(enumerate(sim_vector))
        sim_scores.sort(key=lambda x: x[1], reverse=True)

        recommendations = []
        for other_idx, score in sim_scores:
            if target_idx is not None and other_idx == target_idx:
                continue

            other_p = self.products[other_idx]
            if other_p.get('id') == product_id:
                continue

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
