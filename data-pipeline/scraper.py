import requests
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime, timezone
import sys

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/"
}

def decode_price_history(raw_data):
    """
    Decodes Smartprix's delta-compressed price history.
    b: [base_day, base_price]
    d: [day_offset, delta, day_offset, delta, ...]
    """
    if not raw_data or "b" not in raw_data or "d" not in raw_data:
        return []
    
    a, o = raw_data.get("b", [0, 0])
    c = raw_data.get("d", [])
    if not c or len(c) < 2:
        return []
        
    history_points = []
    l = c[0]
    u = c[1]

    for idx in range(0, len(c), 2):
        t_day = c[idx]
        delta = c[idx + 1]
        
        while l < t_day:
            dt = datetime.fromtimestamp((l + a) * 86400, tz=timezone.utc)
            history_points.append({"date": dt.strftime("%Y-%m-%d"), "price": float(u + o)})
            l += 1
            
        u = delta
        l = t_day
        dt = datetime.fromtimestamp((l + a) * 86400, tz=timezone.utc)
        history_points.append({"date": dt.strftime("%Y-%m-%d"), "price": float(u + o)})

    # Deduplicate keeping latest
    unique = {}
    for p in history_points:
        unique[p["date"]] = p["price"]
        
    return [{"date": k, "price": v} for k, v in unique.items()]

def scrape_smartphone_urls(limit=5):
    url = "https://www.smartprix.com/mobiles"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        return []
        
    soup = BeautifulSoup(resp.text, "lxml")
    product_links = []
    for a in soup.find_all("a", href=True):
        href = a['href']
        if href.startswith("/mobiles/") and "-p" in href and not href.endswith("-list"):
            full_url = "https://www.smartprix.com" + href
            if full_url not in product_links:
                product_links.append(full_url)
                if len(product_links) >= limit:
                    break
    return product_links

def scrape_product_detail(url):
    resp = requests.get(url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        return None
        
    soup = BeautifulSoup(resp.text, "lxml")
    
    # Extract embedded JSON
    item = None
    for s in soup.find_all("script"):
        content = s.string or ""
        if '"component":"ProductPage"' in content and '"item":' in content:
            try:
                data = json.loads(content)
                item = data.get("$way", {}).get("props", {}).get("item")
                if item:
                    break
            except Exception:
                continue

    if not item:
        return None

    # Specs bullet list
    specs = []
    if "features" in item and isinstance(item["features"], list):
        specs = [f["text"] for f in item["features"] if isinstance(f, dict) and "text" in f][:6]
    elif "mainSpecs" in item and "value" in item["mainSpecs"]:
        for grp in item["mainSpecs"]["value"]:
            for itm in grp.get("items", []):
                if "text" in itm:
                    specs.append(itm["text"])
            if len(specs) >= 6:
                break

    # Tech Specs map
    tech_specs = {}
    if "fullSpecs" in item and isinstance(item["fullSpecs"], list):
        for section in item["fullSpecs"]:
            sec_title = section.get("title", "Details")
            for field in section.get("items", []):
                t = field.get("title")
                d = field.get("description")
                if t and d:
                    # Clean html tags
                    d_clean = re.sub(r'<[^>]+>', ' ', d).strip()
                    tech_specs[t] = d_clean

    # Store listings
    stores = []
    price_comp = item.get("priceComparison", {}).get("table", {})
    new_stores = price_comp.get("new", [])
    
    for st in new_stores:
        st_info = st.get("store", {})
        store_name = st_info.get("name", "Store")
        store_slug = st_info.get("slug", store_name.lower().replace(" ", "-"))
        store_price = float(st.get("price", item.get("price", 0)))
        prod_url = st.get("trackingLink", url)
        
        stores.append({
            "name": store_name,
            "slug": store_slug,
            "price": store_price,
            "productUrl": prod_url,
            "mrp": float(item.get("mrp", store_price * 1.15)) if "mrp" in item else None,
            "stockStatus": "IN_STOCK"
        })

    if not stores:
        best_st = item.get("bestStore", {}).get("store", {})
        st_name = best_st.get("name", "Amazon")
        stores.append({
            "name": st_name,
            "slug": st_name.lower(),
            "price": float(item.get("price", 0)),
            "productUrl": url,
            "mrp": None,
            "stockStatus": "IN_STOCK"
        })

    # Image
    image_id = item.get("imageId", "")
    image_url = f"https://cdn1.smartprix.com/rx-i{image_id}-w1200-h1200/{image_id}.webp" if image_id else None

    # Price history
    pid = item.get("id")
    price_history = []
    if pid and item.get("hasPriceHistory"):
        try:
            hist_headers = dict(HEADERS)
            hist_headers["Origin"] = "https://www.smartprix.com"
            hist_headers["Referer"] = url
            hist_headers["Content-Type"] = "application/json"
            
            h_res = requests.post(
                "https://www.smartprix.com/api/arc/price-history",
                headers=hist_headers,
                json={"pid": pid, "type": "bdp"},
                timeout=10
            )
            if h_res.status_code == 200:
                h_json = h_res.json()
                if h_json.get("status") == "success":
                    price_history = decode_price_history(h_json.get("data", {}))
        except Exception as e:
            pass

    return {
        "externalId": pid,
        "name": item.get("name", "Smartphone"),
        "brand": item.get("brand", {}).get("name", "Generic"),
        "category": "Smartphones",
        "description": item.get("descriptions", {}).get("top", ""),
        "price": float(item.get("price", 0)),
        "rating": float(item.get("rating", 0)) / 20.0 if item.get("rating", 0) > 5 else float(item.get("rating", 0)),
        "reviewCount": int(item.get("reviewCount", 0)),
        "imageUrl": image_url,
        "specs": specs,
        "techSpecs": tech_specs,
        "stores": stores,
        "priceHistory": price_history
    }

def run_scraper(limit=3):
    urls = scrape_smartphone_urls(limit)
    results = []
    for u in urls:
        data = scrape_product_detail(u)
        if data:
            results.append(data)
    return results

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    lim = 2
    if len(sys.argv) > 1:
        try:
            lim = int(sys.argv[1])
        except:
            pass
    res = run_scraper(lim)
    print(json.dumps(res, ensure_ascii=True))
