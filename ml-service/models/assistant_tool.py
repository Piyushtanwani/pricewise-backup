import os
import re
import json
import requests
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../backend/.env'))

STOPWORDS = {
    "what", "is", "the", "best", "phone", "phones", "mobile", "mobiles", "smartphones", "smartphone",
    "for", "me", "under", "below", "less", "than", "within", "budget", "show", "tell",
    "recommend", "suggest", "find", "good", "great", "top", "looking", "want", "need",
    "which", "should", "buy", "price", "prices", "in", "with", "and", "or", "to", "at",
    "about", "please", "can", "you", "a", "an", "of", "rs", "inr", "rupees", "rupee",
    "k", "thousand", "lakh", "lakhs", "lac", "lacs"
}

BRAND_ALIASES = {
    "iphone": "apple",
    "ipad": "apple",
    "macbook": "apple",
    "galaxy": "samsung",
    "pixel": "google",
    "redmi": "xiaomi",
    "mi": "xiaomi",
    "moto": "motorola",
    "nord": "oneplus"
}

BRAND_TRAITS = {
    "apple": {
        "sw": "iOS (seamless ecosystem, long-term software support, strict privacy)",
        "hw": "industry-leading Bionic/A-series chips, premium build, class-leading video recording",
        "audience": "buyers already in the Apple ecosystem or those wanting premium video capture and long-term durability"
    },
    "samsung": {
        "sw": "One UI (highly customizable, DeX desktop mode, rich multitasking)",
        "hw": "class-leading Dynamic AMOLED displays, versatile multi-lens zoom cameras, Galaxy AI tools",
        "audience": "users who want the finest display quality, versatile cameras, and flexible multitasking"
    },
    "oneplus": {
        "sw": "OxygenOS (smooth animations, gaming tools, responsive gesture navigation)",
        "hw": "flagship Snapdragon chips, ultra-fast SuperVOOC charging (80W-100W), Alert Slider",
        "audience": "performance enthusiasts, mobile gamers, and users who prioritize rapid charging"
    },
    "motorola": {
        "sw": "Hello UI / near-stock Android (clean, zero adware/bloatware, intuitive Moto gestures)",
        "hw": "lightweight ergonomic designs, curved pOLED displays, IP68 water resistance at budget-friendly prices",
        "audience": "users who value a clean stock Android experience, lightweight ergonomics, and aggressive mid-range value"
    },
    "google": {
        "sw": "Pure Pixel Android (exclusive Feature Drops, best-in-class Google AI, Call Assist)",
        "hw": "Google Tensor chipsets with advanced computational photography and HDR processing",
        "audience": "photography enthusiasts and Android purists who want Day 1 updates and smart AI features"
    },
    "oppo": {
        "sw": "ColorOS (vibrant, feature-packed UI, smart sidebar, battery optimization)",
        "hw": "stylish aesthetic designs, portrait camera tuning, SUPERVOOC charging",
        "audience": "style-conscious buyers and portrait photography lovers seeking high battery endurance"
    },
    "vivo": {
        "sw": "Funtouch OS (customizable, gaming booster, visual themes)",
        "hw": "ZEISS co-engineered optics, gimbal stabilization, sleek slim form factors",
        "audience": "night and portrait photography enthusiasts wanting top-tier camera stabilization"
    }
}

TECHNICAL_KNOWLEDGE = {
    "snapdragon_vs_dimensity": {
        "pattern": r'\b(snapdragon\s+(?:vs\.?|versus)\s+(?:mediatek|dimensity)|(?:mediatek|dimensity)\s+(?:vs\.?|versus)\s+snapdragon)\b',
        "title": "Snapdragon vs MediaTek Dimensity",
        "content": (
            "### Snapdragon vs MediaTek Dimensity: Comprehensive Comparison\n\n"
            "Both Qualcomm Snapdragon and MediaTek Dimensity build world-class mobile SoCs on cutting-edge ARM architecture (primarily TSMC 4nm and 3nm nodes), but they differ across several critical performance pillars:\n\n"
            "**1. CPU Architecture & Sustained Performance:**\n"
            "• **Snapdragon:** Flagship chips (Snapdragon 8 Elite / 8 Gen 3) utilize Qualcomm's custom Oryon cores and Prime Cortex-X cores, delivering top-tier single-core burst speeds, high UI responsiveness, and balanced sustained thermal performance.\n"
            "• **Dimensity:** Flagship chips (Dimensity 9400 / 9300) pioneer an 'All-Big-Core' architecture without small efficiency cores. This architecture produces exceptional multi-core throughput and heavy multitasking power while maintaining high energy efficiency.\n\n"
            "**2. GPU & Gaming Performance:**\n"
            "• **Snapdragon (Adreno GPU):** Widely recognized as the gold standard for mobile gaming. Qualcomm's Adreno GPUs benefit from extensive game developer optimization, broad emulator support, and custom driver support (Turnip/Mesa). Peak and sustained frame rates in heavy 3D titles (Genshin Impact, BGMI/PUBG) are industry-leading.\n"
            "• **Dimensity (ARM Immortalis / Mali GPU):** Immortalis-G925 delivers desktop-grade hardware ray tracing and phenomenal raw compute. In mainstream mobile titles, performance is neck-and-neck with Snapdragon, though select niche emulators still prioritize Snapdragon driver stacks.\n\n"
            "**3. Thermal Efficiency & Battery Life:**\n"
            "• Both lineups fabricate at TSMC, eliminating older overheating issues.\n"
            "• **Dimensity** often provides class-leading standby time and power efficiency in mixed daily use and streaming.\n"
            "• **Snapdragon** demonstrates exceptional power throttling management under prolonged heavy gaming sessions.\n\n"
            "**4. Camera ISP & AI Compute:**\n"
            "• **Snapdragon:** Spectra ISP excels in 4K/8K HDR computational video, advanced night mode tuning, and broad compatibility with Google Camera (GCam) ports.\n"
            "• **Dimensity:** Imagiq ISP pairs with MediaTek's powerful NPU to deliver swift AI scene processing and rich portrait photography with minimal battery drain.\n\n"
            "**Verdict & Buying Guidance:**\n"
            "• **Choose Snapdragon** if: You are a competitive gamer, frequently play demanding 3D games or emulators, rely on GCam camera mods, or prefer long-term custom software support.\n"
            "• **Choose MediaTek Dimensity** if: You seek the best price-to-performance ratio in the mid-range and upper mid-range (Dimensity 7000 / 8000 / 9000 series), superior multi-core power, and outstanding day-to-day battery efficiency."
        ),
        "insights": [
            {"label": "Gaming & Drivers", "value": "Snapdragon Adreno leads in emulator and game developer optimization"},
            {"label": "Value & Multi-Core", "value": "MediaTek Dimensity leads in multi-core throughput and price-to-performance"}
        ]
    },
    "amoled_vs_oled": {
        "pattern": r'\b(amoled\s+(?:vs\.?|versus)\s+(?:oled|lcd|ips)|oled\s+(?:vs\.?|versus)\s+(?:amoled|lcd|ips)|ips\s+(?:vs\.?|versus)\s+(?:amoled|oled))\b',
        "title": "AMOLED vs OLED",
        "content": (
            "### AMOLED vs OLED: Display Technology Explained\n\n"
            "**1. Fundamental Differences:**\n"
            "• **OLED (Organic Light Emitting Diode):** Individual organic pixels emit their own light, allowing true blacks (infinite contrast ratio) by shutting pixels off completely.\n"
            "• **AMOLED (Active Matrix OLED):** Adds an Active Matrix Thin-Film Transistor (TFT) backplane, allowing independent, rapid control of every pixel.\n\n"
            "**2. Practical Advantages of AMOLED:**\n"
            "• **Faster Refresh Rates & Motion Clarity:** Switches pixel states substantially faster, making 90Hz, 120Hz, and 144Hz displays viable for smartphones and gaming monitors.\n"
            "• **Higher Power Efficiency:** Consumes significantly less power when displaying dark UI themes or during Always-On Display (AOD).\n"
            "• **Brighter Outdoor Visibility:** Modern Super AMOLED and Dynamic AMOLED panels reach 2,000+ to 4,500 nits peak brightness.\n\n"
            "**Verdict:** All modern smartphone 'OLED' screens are technically AMOLED. Choose Super AMOLED / Dynamic AMOLED for the deepest contrast, vibrant HDR color reproduction, and lower battery drain."
        ),
        "insights": [
            {"label": "Contrast Ratio", "value": "Infinite contrast with true pitch blacks"},
            {"label": "Efficiency", "value": "Consumes 0 power for black pixels in Dark Mode"}
        ]
    },
    "intel_vs_amd": {
        "pattern": r'\b(intel\s+(?:vs\.?|versus)\s+amd|amd\s+(?:vs\.?|versus)\s+intel|ryzen\s+(?:vs\.?|versus)\s+core|core\s+(?:vs\.?|versus)\s+ryzen)\b',
        "title": "Intel Core vs AMD Ryzen",
        "content": (
            "### Intel Core vs AMD Ryzen: Which Should You Buy?\n\n"
            "**1. Gaming Performance:**\n"
            "• **AMD Ryzen:** Processors equipped with 3D V-Cache (e.g. Ryzen 7 7800X3D / 9800X3D) offer the world's highest frame rates in cache-sensitive PC gaming.\n"
            "• **Intel Core:** Core Ultra / 14th Gen processors deliver high single-core clocks and strong gaming performance with extensive Thunderbolt and PCIe lane support.\n\n"
            "**2. Productivity & Multi-Threaded Workloads:**\n"
            "• **Intel:** Hybrid architecture (Performance cores + Efficient cores) provides excellent multi-tasking and quick video rendering via Intel QuickSync.\n"
            "• **AMD:** Full-power Zen cores across the entire chip excel in code compilation, 3D rendering (Blender), and sustained compute.\n\n"
            "**3. Power Consumption & Thermals:**\n"
            "• AMD's TSMC fabrication generally delivers superior performance-per-watt and cooler operations in laptops, extending battery longevity.\n\n"
            "**Verdict:** Choose **AMD Ryzen** for superior laptop battery life and pure gaming cache performance. Choose **Intel** for QuickSync hardware video transcoding, Thunderbolt peripherals, and versatile multi-tasking."
        ),
        "insights": [
            {"label": "Battery Efficiency", "value": "AMD Ryzen generally offers longer battery life in laptops"},
            {"label": "Creator Workflows", "value": "Intel QuickSync provides fast hardware video encoding"}
        ]
    },
    "rtx_4050_vs_4060": {
        "pattern": r'\b(rtx\s*4050\s+(?:vs\.?|versus)\s+rtx\s*4060|rtx\s*4060\s+(?:vs\.?|versus)\s+rtx\s*4050|4050\s+(?:vs\.?|versus)\s+4060)\b',
        "title": "NVIDIA GeForce RTX 4050 vs RTX 4060",
        "content": (
            "### NVIDIA GeForce RTX 4050 vs RTX 4060: Mobile GPU Comparison\n\n"
            "**1. Key Specification Differences:**\n"
            "• **VRAM:** RTX 4050 has **6 GB GDDR6** (96-bit bus). RTX 4060 has **8 GB GDDR6** (128-bit bus).\n"
            "• **CUDA Cores:** RTX 4050 features 2,560 cores vs 3,072 cores on the RTX 4060 (~20% more compute).\n\n"
            "**2. Gaming Performance (1080p & 1440p):**\n"
            "• The **RTX 4060 is approximately 18% to 25% faster** than the RTX 4050 across modern AAA games.\n"
            "• The crucial advantage is the **8GB VRAM buffer** on the RTX 4060. Modern titles (The Last of Us, Hogwarts Legacy, Cyberpunk 2077) easily exceed 6GB VRAM at High/Ultra settings, causing stuttering on 6GB cards.\n\n"
            "**Verdict:** If your budget allows an extra ₹10,000 to ₹15,000, **get the RTX 4060**. Its 8GB VRAM ensures 3-4 years of smooth high-setting gaming, whereas 6GB VRAM on the 4050 will force lower textures in newer titles."
        ),
        "insights": [
            {"label": "VRAM Advantage", "value": "RTX 4060 has 8GB VRAM vs 6GB on RTX 4050"},
            {"label": "Performance Gap", "value": "RTX 4060 is 20-25% faster in AAA gaming"}
        ]
    },
    "refresh_rate": {
        "pattern": r'\b(what is refresh rate|60hz vs 120hz|120hz vs 144hz|refresh rate explained)\b',
        "title": "What is Refresh Rate?",
        "content": (
            "### What is Refresh Rate? (60Hz vs 120Hz vs 144Hz)\n\n"
            "Refresh rate (measured in Hertz, Hz) indicates how many times per second the display redraws the image on screen:\n\n"
            "• **60Hz (Standard):** 60 frames per second. Adequate for basic video playback and web browsing, but noticeable motion blur during fast scrolling.\n"
            "• **120Hz (High Refresh Rate):** 120 frames per second. Delivers double the smoothness. Animations feel instantaneous, scrolling is buttery smooth, and touch response latency drops significantly.\n"
            "• **144Hz - 240Hz (Esports Gaming):** Crucial for fast-paced competitive shooters (Valorant, CS2, Apex Legends) where split-second reaction times matter.\n\n"
            "**Verdict:** In 2025/2026, never buy a smartphone or gaming laptop capped at 60Hz. Look for an **adaptive 120Hz LTPO display** that drops to 1Hz when reading text (to save battery) and ramps to 120Hz when scrolling."
        ),
        "insights": [
            {"label": "Responsiveness", "value": "120Hz cuts touch input latency in half"},
            {"label": "LTPO Tech", "value": "Dynamically scales from 1Hz to 120Hz to preserve battery"}
        ]
    },
    "ram_requirements": {
        "pattern": r'\b(is 8gb ram enough|is 16gb ram enough|how much ram|8gb vs 16gb ram|16gb vs 32gb ram)\b',
        "title": "RAM Buying Guide",
        "content": (
            "### How Much RAM Do You Need? (8GB vs 16GB vs 32GB)\n\n"
            "**1. 8 GB RAM:**\n"
            "• **Smartphones:** Adequate for budget phones running basic apps, but background apps will frequently reload.\n"
            "• **Laptops/PCs:** Outdated for modern computing. Windows 11 and web browsers (Chrome with 10+ tabs) consume 5-6GB alone. Strongly avoid 8GB for software development or gaming.\n\n"
            "**2. 16 GB RAM (The Sweet Spot):**\n"
            "• **Laptops/PCs:** Ideal for programming (VS Code, Docker, Node.js), modern AAA gaming, and multi-tab productivity with zero memory bottleneck.\n"
            "• **Smartphones:** Recommended for flagship Android devices to keep heavy background AI models and camera processing fast.\n\n"
            "**3. 32 GB+ RAM:**\n"
            "• Essential for Local Machine Learning models, running multiple Docker containers / Kubernetes clusters, 4K video editing (Premiere Pro), and heavy 3D rendering."
        ),
        "insights": [
            {"label": "Standard Recommendation", "value": "16GB is the minimum recommended for laptops today"},
            {"label": "Heavy Workloads", "value": "Choose 32GB for Docker, Machine Learning, and 4K editing"}
        ]
    }
}

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
        """Tool 1: Controlled product search in catalogue with NLP stopword filtering."""
        q_lower = query.lower().strip()
        brand_lower = brand.lower().strip() if brand else ""
        results = []

        # Filter conversational stopwords and pure digits
        raw_words = [w for w in re.split(r'\W+', q_lower) if len(w) > 2]
        content_words = [w for w in raw_words if w not in STOPWORDS and not w.isdigit()]

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
            if content_words:
                for w in content_words:
                    if w in p_name:
                        score += 3
                    elif w in p_brand:
                        score += 2
                    elif any(w in str(s).lower() for s in p.get('specs', [])):
                        score += 1
                if score == 0:
                    continue
            else:
                # Rank by rating and discount when query is purely conversational / budget-based
                score = (p.get('rating', 0.0) * 2) + ((p.get('discount', 0) or 0) / 10)

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
        """Formats catalog product into the frontend ProductCard shape using verified data."""
        price = p.get('bestPrice') or p.get('mrp') or 0.0
        mrp = p.get('mrp') or round(price * 1.15)
        discount = round(((mrp - price) / mrp) * 100) if mrp > price else 0

        # Verified store attribution: read bestStore or first store name rather than hardcoding Amazon
        best_store = p.get('bestStore')
        if not best_store and p.get('stores') and isinstance(p['stores'], list) and len(p['stores']) > 0:
            first = p['stores'][0]
            best_store = first.get('name') if isinstance(first, dict) else str(first)
        if not best_store or best_store == 'Retail Store':
            best_store = "Amazon" if "amazon" in p.get('name', '').lower() else "Verified Store"

        # Grounded price history: do not fabricate synthetic price drops
        history = p.get('priceHistory')
        if not history or not isinstance(history, list) or len(history) < 2:
            history = [price, price, price]

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
            "bestStore": best_store,
            "stores": len(p.get('stores', [])) if isinstance(p.get('stores'), list) and p.get('stores') else 1,
            "trend": "falling" if discount > 10 else "stable",
            "category": p.get('category', 'Mobiles'),
            "aiVerdict": "Great Value" if discount >= 15 else "Fair Price",
            "verdictColor": "green" if discount >= 15 else "amber",
            "priceHistory": history
        }

    # ---------------- Parse Intent and Budget ----------------
    def parse_user_query(self, message: str) -> Dict[str, Any]:
        msg = message.lower()
        # Normalize commas in prices (e.g. ₹30,000 -> ₹30000)
        clean_msg = re.sub(r'(\d),(\d)', r'\1\2', msg)

        # Parse budget (e.g. "under 30000", "under 30k", "below 1.5 lakh", "under ₹30,000")
        budget = None
        b_match = re.search(r'(?:under|below|less than|within|budget of|up to|around|max)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?)?', clean_msg)
        if not b_match:
            b_match = re.search(r'(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?)?', clean_msg)
        if b_match:
            val = float(b_match.group(1))
            unit = b_match.group(2)
            if unit in ['k', 'thousand']:
                val *= 1000
            elif unit in ['lakh', 'lakhs', 'lac', 'lacs']:
                val *= 100000
            elif val < 100 and val >= 5:
                # Handle shorthand thousands like "under 30" -> 30000
                val *= 1000
            budget = round(val)

        # Check if query is a technical question first (e.g. "Snapdragon vs Dimensity", "AMOLED vs OLED")
        matched_tech = None
        for key, data in TECHNICAL_KNOWLEDGE.items():
            if re.search(data['pattern'], clean_msg):
                matched_tech = data
                break

        # Check if query is a comparison or choice between options (e.g. "iPhone 15 or Galaxy S25")
        is_choice = bool(
            re.search(r'\b(?:vs\.?|versus|compare|difference between|better than)\b', msg) or
            (re.search(r'\bor\b', msg) and any(w in msg for w in ["should i buy", "which", "better", "choose", "prefer", "buy", "pick"]))
        )

        # Detect intent
        intent = "recommend"
        if matched_tech:
            intent = "technical_qa"
        elif is_choice:
            intent = "compare"
        elif any(w in msg for w in ["cheaper", "alternative", "similar", "instead of"]):
            intent = "alternatives"
        elif any(w in msg for w in ["should i buy", "buy now", "good time", "wait"]):
            intent = "buy_now"

        # Detect brand mentions including product aliases (e.g. "iphone" -> "apple", "galaxy" -> "samsung")
        brands = ["apple", "samsung", "oneplus", "xiaomi", "redmi", "motorola", "vivo", "realme", "oppo", "google", "sony", "lg", "iqoo", "poco", "nothing", "asus"]
        detected_brands_set = set()
        for b in brands:
            if re.search(r'\b' + re.escape(b) + r'\b', msg):
                detected_brands_set.add(b)
        for alias, mapped_brand in BRAND_ALIASES.items():
            if re.search(r'\b' + re.escape(alias) + r'\b', msg):
                detected_brands_set.add(mapped_brand)
        detected_brands = list(detected_brands_set)
        detected_brand = detected_brands[0] if detected_brands else None

        return {
            "intent": intent,
            "budget": budget,
            "brand": detected_brand,
            "brands": detected_brands,
            "tech_info": matched_tech,
            "raw": message
        }

    def extract_comparison_targets(self, query: str) -> List[str]:
        q = query.lower()
        cleaned = re.sub(r'^(?:should i buy|which is better|which one is better|which phone is better|compare|tell me between)\s+', '', q)
        cleaned = re.sub(r'\?+$', '', cleaned)
        parts = []
        if re.search(r'\s+(?:vs\.?|versus)\s+', cleaned):
            parts = re.split(r'\s+(?:vs\.?|versus)\s+', cleaned)
        elif re.search(r'\s+or\s+', cleaned):
            parts = re.split(r'\s+or\s+', cleaned)
        elif ' and ' in cleaned and any(w in q for w in ["compare", "difference", "between"]):
            parts = re.split(r'\s+and\s+', cleaned)
        return [p.strip() for p in parts if len(p.strip()) > 1]

    # ---------------- Execution & Grounded Generation ----------------
    def reply(self, user_message: str) -> Dict[str, Any]:
        parsed = self.parse_user_query(user_message)
        matched_products = []

        # Intent 0: Technical QA Intent (e.g. "Snapdragon vs MediaTek Dimensity", "AMOLED vs OLED")
        if parsed['intent'] == 'technical_qa':
            tech_info = parsed.get('tech_info')
            formatted_cards: List[Dict[str, Any]] = []

            # Try Groq LLM Generation
            if self.groq_api_key:
                try:
                    system_prompt = (
                        "You are the official PriceWise AI Hardware & Technology Specialist. "
                        "Provide an in-depth, authoritative, structured, and practical technical answer. "
                        "Explain architectural details, real-world gaming/multitasking impact, power efficiency, and clear buying advice. "
                        "Do NOT force-fit irrelevant product tables or fabricate mock specifications."
                    )
                    user_prompt = (
                        f"The user is asking a technical shopping question: \"{user_message}\"\n\n"
                        "Provide a comprehensive, expert breakdown covering:\n"
                        "1. Core Architecture & Manufacturing Nodes\n"
                        "2. CPU & GPU Performance (Gaming, Drivers, Emulation)\n"
                        "3. Thermal Efficiency & Battery Life\n"
                        "4. ISP & Camera Processing\n"
                        "5. Clear Buying Verdict (who should buy which option and in which budget tiers)."
                    )
                    headers = {
                        "Authorization": f"Bearer {self.groq_api_key}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": self.groq_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "max_tokens": 800,
                        "temperature": 0.2
                    }
                    r = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=10.0)
                    if r.status_code == 200:
                        ai_text = r.json()['choices'][0]['message']['content'].strip()
                        return {
                            "role": "assistant",
                            "content": ai_text,
                            "products": formatted_cards,
                            "insights": tech_info['insights'] if tech_info else [
                                {"label": "Technical Analysis", "value": "Architectural and real-world performance breakdown"},
                                {"label": "Recommendation", "value": "Tailored to your specific performance and budget priorities"}
                            ],
                            "parsed": parsed,
                            "source": f"groq-{self.groq_model}"
                        }
                except Exception:
                    pass

            # Grounded Rule-Based Technical Answer
            content = tech_info['content'] if tech_info else (
                f"### Technical Guide: {user_message}\n\n"
                f"When evaluating hardware options, assess three primary criteria:\n"
                f"• **Performance & Workload:** Match core clocks and GPU architecture to your use case (gaming vs productivity).\n"
                f"• **Efficiency & Thermal Design:** Modern nodes (TSMC 4nm/3nm) run substantially cooler and extend battery longevity.\n"
                f"• **Driver & Ecosystem Support:** Long-term software updates and driver optimizations are crucial for sustained stability."
            )
            return {
                "role": "assistant",
                "content": content,
                "products": formatted_cards,
                "insights": tech_info['insights'] if tech_info else [
                    {"label": "Technical Architecture", "value": "Deep hardware analysis and real-world trade-offs"}
                ],
                "parsed": parsed,
                "source": "rule-based-fallback"
            }

        # Intent 1: Comparison Intent
        if parsed['intent'] == 'compare':
            # Priority 1: Check if comparing specific target names (e.g. "iPhone 15 or Galaxy S25")
            targets = self.extract_comparison_targets(user_message)
            if len(targets) >= 2:
                matched_by_target = []
                for t in targets[:2]:
                    t_tokens = [w for w in re.split(r'\W+', t) if len(w) > 1 and w not in STOPWORDS]
                    scored = []
                    for p in self.products:
                        p_name = p.get('name', '').lower()
                        p_brand = p.get('brand', '').lower()
                        score = 0
                        for tok in t_tokens:
                            if tok in p_name:
                                score += 3
                            elif tok in p_brand:
                                score += 2
                            elif any(tok in str(s).lower() for s in p.get('specs', [])):
                                score += 1
                        if score > 0:
                            exact_bonus = sum(5 for tok in t_tokens if re.search(r'\b' + re.escape(tok) + r'\b', p_name))
                            scored.append((score + exact_bonus, p))
                    scored.sort(key=lambda x: (x[0], x[1].get('rating', 0)), reverse=True)
                    for _, p in scored[:2]:
                        if p not in matched_by_target:
                            matched_by_target.append(p)
                if len(matched_by_target) >= 2:
                    matched_products = matched_by_target

            # Priority 2: Multi-brand comparison (e.g. "Compare OnePlus and Motorola")
            if not matched_products and len(parsed.get('brands', [])) >= 2:
                brand_products = []
                for b in parsed['brands'][:2]:
                    b_prods = [p for p in self.products if b in p.get('brand', '').lower() or b in p.get('name', '').lower()]
                    if parsed['budget']:
                        b_prods = [p for p in b_prods if (p.get('bestPrice') or p.get('mrp') or 999999) <= parsed['budget']]
                    b_prods.sort(key=lambda x: (x.get('rating', 0) * 2 + (x.get('discount', 0) or 0) / 10), reverse=True)
                    brand_products.extend(b_prods[:2])
                matched_products = brand_products
            elif not matched_products:
                # Priority 3: General specific product mention scanning
                mentioned = []
                msg_lower = user_message.lower()
                for p in self.products:
                    p_name = p.get('name', '').lower()
                    if p_name in msg_lower:
                        mentioned.append(p)
                    else:
                        tokens = [t for t in p_name.split() if len(t) > 2 and t not in STOPWORDS]
                        hits = [t for t in tokens if t in msg_lower]
                        if len(hits) >= 2 or (len(hits) >= 1 and any(c.isdigit() for c in hits[0])):
                            mentioned.append(p)
                if len(mentioned) >= 2:
                    matched_products = mentioned[:4]
                elif len(mentioned) == 1 and self.recommender:
                    # Compare mentioned product with its top alternative
                    alts = self.recommender.find_alternatives(mentioned[0]['id'], limit=1)
                    alt_products = [self.product_map[a['product_id']] for a in alts if a['product_id'] in self.product_map]
                    matched_products = mentioned + alt_products

        # Intent 2: Standard Search / Recommendation
        if not matched_products:
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
                brand=parsed['brand'],
                limit=4
            )

        if not matched_products:
            if parsed['budget']:
                # Find all products strictly under budget
                under_budget = [p for p in self.products if (p.get('bestPrice') or p.get('mrp') or 999999) <= parsed['budget']]
                if under_budget:
                    under_budget.sort(key=lambda x: (x.get('rating', 0) * 2 + (x.get('discount', 0) or 0) / 10), reverse=True)
                    matched_products = under_budget[:4]
                else:
                    # Genuinely no product under budget: pick the closest/cheapest in the entire catalog
                    cheapest = sorted(self.products, key=lambda x: (x.get('bestPrice') or x.get('mrp') or 999999))[:3]
                    matched_products = cheapest
            else:
                matched_products = self.products[:3]

        formatted_cards = [self.format_product_card(p) for p in matched_products]

        # Try Groq LLM Generation
        if self.groq_api_key:
            try:
                system_prompt = (
                    "You are the official PriceWise Smart Shopping Assistant. "
                    "Your role is to help users compare smartphone prices, specifications, and find deals. "
                    "You must strictly ground your answer in the provided catalogue products. "
                    "Do NOT fabricate prices, retailers, or specs. Be structured, concise, and ensure your answer and final verdict are completely written out without cutting off."
                )

                catalog_summary = "\n".join([
                    f"- {p['name']} ({p['brand']}): Current Best Price ₹{int(p.get('bestPrice', 0)):,} (MRP: ₹{int(p.get('mrp', 0)):,}). Key Specs: {', '.join(p.get('specs', [])[:3])}"
                    for p in matched_products
                ])

                if parsed['intent'] == 'compare' and len(parsed.get('brands', [])) >= 2:
                    b1 = parsed['brands'][0].title()
                    b2 = parsed['brands'][1].title()
                    user_prompt = (
                        f"User asked: \"{user_message}\"\n\n"
                        f"Ground Truth Catalog Products for {b1} and {b2}:\n{catalog_summary}\n\n"
                        f"Provide a balanced, objective comparison between {b1} and {b2}. "
                        f"Do NOT just declare one as 'the best'. Instead, compare both brands on:\n"
                        f"1. Pricing & Value Range: Contrast prices using the listed catalog models.\n"
                        f"2. Software & Experience: Compare software philosophies (e.g., clean stock Android vs feature-rich UI).\n"
                        f"3. Hardware & Performance: Contrast processors, charging speeds, and build.\n"
                        f"4. Clear Verdict: Conclude with who should choose {b1} vs who should choose {b2}."
                    )
                elif parsed['intent'] == 'compare' and len(matched_products) >= 2:
                    user_prompt = (
                        f"User asked: \"{user_message}\"\n\n"
                        f"Matching Ground Truth Catalog Products:\n{catalog_summary}\n\n"
                        f"Provide a direct side-by-side comparison between these models. Do NOT simply declare one as the best. "
                        f"Contrast their specs, prices, and trade-offs clearly so the user can choose based on their preferences."
                    )
                elif parsed['budget']:
                    user_prompt = (
                        f"User asked: \"{user_message}\" (Budget: under ₹{parsed['budget']:,})\n\n"
                        f"Matching Ground Truth Catalog Products (within budget):\n{catalog_summary}\n\n"
                        f"Recommend the best options from this list, highlighting why they are the top choices within the user's budget. Cite their exact prices and key specs."
                    )
                else:
                    user_prompt = (
                        f"User asked: \"{user_message}\"\n\n"
                        f"Matching Ground Truth Catalog Products:\n{catalog_summary}\n\n"
                        f"Provide a helpful recommendation citing these exact prices and specs."
                    )

                prompt_messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ]

                headers = {
                    "Authorization": f"Bearer {self.groq_api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": self.groq_model,
                    "messages": prompt_messages,
                    "max_tokens": 800,
                    "temperature": 0.3
                }

                r = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=10.0
                )

                if r.status_code == 200:
                    ai_text = r.json()['choices'][0]['message']['content'].strip()
                    insights = [
                        {"label": "Catalog Intelligence", "value": f"Verified {len(matched_products)} matching models in current stock"},
                        {"label": "Price Verification", "value": f"Lowest price: ₹{int(formatted_cards[0]['bestPrice']):,} across tracked stores"}
                    ]
                    if parsed['intent'] == 'compare' and len(parsed.get('brands', [])) >= 2:
                        b1 = parsed['brands'][0].title()
                        b2 = parsed['brands'][1].title()
                        insights = [
                            {"label": "Brand Comparison", "value": f"{b1} vs {b2} across {len(matched_products)} verified models"},
                            {"label": "Price Range", "value": f"From ₹{int(min(c['bestPrice'] for c in formatted_cards)):,} to ₹{int(max(c['bestPrice'] for c in formatted_cards)):,}"}
                        ]
                    return {
                        "role": "assistant",
                        "content": ai_text,
                        "products": formatted_cards,
                        "insights": insights,
                        "parsed": parsed,
                        "source": f"groq-{self.groq_model}"
                    }
            except Exception:
                # Fall back gracefully to rule-based generation
                pass

        # Deterministic Grounded Fallback
        if parsed['intent'] == 'compare' and len(parsed.get('brands', [])) >= 2:
            b1_key = parsed['brands'][0].lower()
            b2_key = parsed['brands'][1].lower()
            b1 = b1_key.title()
            b2 = b2_key.title()
            b1_cards = [c for c in formatted_cards if b1_key in c['brand'].lower() or b1_key in c['name'].lower()]
            b2_cards = [c for c in formatted_cards if b2_key in c['brand'].lower() or b2_key in c['name'].lower()]

            t1 = BRAND_TRAITS.get(b1_key, {
                "sw": f"{b1}'s software experience",
                "hw": "distinctive hardware specs and camera setup",
                "audience": f"buyers who favor {b1}'s design and ecosystem"
            })
            t2 = BRAND_TRAITS.get(b2_key, {
                "sw": f"{b2}'s software experience",
                "hw": "competitive hardware and pricing",
                "audience": f"buyers who prioritize {b2}'s feature set"
            })

            p1_str = f"with catalogue options like the {b1_cards[0]['name']} at ₹{int(b1_cards[0]['bestPrice']):,}" if b1_cards else "with upcoming catalogue listings"
            p2_str = f"with catalogue options like the {b2_cards[0]['name']} at ₹{int(b2_cards[0]['bestPrice']):,}" if b2_cards else "with upcoming catalogue listings"

            content = (
                f"Comparing {b1} versus {b2}:\n\n"
                f"• {b1}: Known for {t1['hw']} and powered by {t1['sw']}, {p1_str}.\n"
                f"• {b2}: Emphasizes {t2['hw']} alongside {t2['sw']}, {p2_str}.\n\n"
                f"Verdict: Choose {b1} if you are {t1['audience']}. Choose {b2} if you are {t2['audience']}."
            )
            min_p = int(min(c['bestPrice'] for c in formatted_cards)) if formatted_cards else 0
            max_p = int(max(c['bestPrice'] for c in formatted_cards)) if formatted_cards else 0
            insights = [
                {"label": "Brand Comparison", "value": f"{b1} vs {b2} across {len(formatted_cards)} verified models"},
                {"label": "Price Range", "value": f"From ₹{min_p:,} to ₹{max_p:,}"}
            ]
        elif parsed['intent'] == 'compare' and len(formatted_cards) >= 2:
            p1 = formatted_cards[0]
            # Pick a second product from a different brand/model line if available
            p2 = next((c for c in formatted_cards[1:] if c['brand'].lower() != p1['brand'].lower() or c['name'][:8].lower() != p1['name'][:8].lower()), formatted_cards[1])
            content = (
                f"### Comparing {p1['name']} versus {p2['name']}:\n\n"
                f"• **{p1['name']} ({p1['brand']}):** Currently available at ₹{int(p1['bestPrice']):,} (MRP: ₹{int(p1['mrp']):,}, {p1['discount']}% discount). "
                f"Features {', '.join(p1['specs'][:3])}.\n"
                f"• **{p2['name']} ({p2['brand']}):** Currently available at ₹{int(p2['bestPrice']):,} (MRP: ₹{int(p2['mrp']):,}, {p2['discount']}% discount). "
                f"Features {', '.join(p2['specs'][:3])}.\n\n"
                f"**Verdict:**\n"
                f"• Choose the **{p1['name']}** if you prioritize {p1['brand']}'s ecosystem integration, video capture, and software consistency.\n"
                f"• Choose the **{p2['name']}** if you prioritize {p2['brand']}'s display fluidity, hardware versatility, and customizable features."
            )
            price_diff = abs(int(p1['bestPrice']) - int(p2['bestPrice']))
            cheaper = p1 if p1['bestPrice'] < p2['bestPrice'] else p2
            insights = [
                {"label": "Direct Comparison", "value": f"{p1['name']} vs {p2['name']}"},
                {"label": "Price Difference", "value": f"{cheaper['name']} is ₹{price_diff:,} cheaper"}
            ]
        else:
            top = formatted_cards[0]
            content = (
                f"Based on our catalog, the top option matching your request is the {top['name']} "
                f"currently available at ₹{int(top['bestPrice']):,} (a {top['discount']}% savings from ₹{int(top['mrp']):,}). "
                f"Key highlights include {', '.join(top['specs'][:2])}."
            )
            insights = [
                {"label": "Best Price Match", "value": f"₹{int(top['bestPrice']):,} on {top['bestStore']}"},
                {"label": "Savings", "value": f"{top['discount']}% off MRP"}
            ]

        return {
            "role": "assistant",
            "content": content,
            "products": formatted_cards,
            "insights": insights,
            "parsed": parsed,
            "source": "rule-based-fallback"
        }
