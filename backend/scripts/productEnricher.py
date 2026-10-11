import sys
import json
import requests
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/"
}

def decode_price_history(raw_data):
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

    unique = {}
    for p in history_points:
        unique[p["date"]] = p["price"]
        
    return [{"date": k, "price": v} for k, v in unique.items()]

def enrich_product(url):
    if not url.startswith("http"):
        url = "https://www.smartprix.com" + url

    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return {"error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"error": str(e)}

    item = None
    for part in r.text.split("<script"):
        if '"component":"ProductPage"' in part and '"item":' in part:
            idx = part.find("{")
            end_idx = part.rfind("}")
            if idx != -1 and end_idx != -1:
                try:
                    data = json.loads(part[idx:end_idx+1])
                    item = data.get("$way", {}).get("props", {}).get("item")
                    if item:
                        break
                except:
                    pass

    if not item:
        return {"error": "Item not found in page"}

    pid = item.get("id")
    price_comp = item.get("priceComparison", {}).get("table", {})
    new_stores = price_comp.get("new", [])
    
    stores = []
    base_price = float(item.get("price", 0))
    for st in new_stores:
        st_info = st.get("store", {})
        store_name = st_info.get("name", "Store")
        store_slug = st_info.get("slug", store_name.lower().replace(" ", "-"))
        store_price = float(st.get("price", base_price))
        prod_url = st.get("trackingLink", url)
        stores.append({
            "name": store_name,
            "slug": store_slug,
            "price": store_price,
            "productUrl": prod_url,
            "mrp": float(item.get("mrp", store_price * 1.15)) if "mrp" in item else None,
            "stockStatus": "IN_STOCK"
        })

    price_history = []
    if pid and item.get("hasPriceHistory"):
        h_headers = dict(HEADERS)
        h_headers["Origin"] = "https://www.smartprix.com"
        h_headers["Referer"] = url
        h_headers["Content-Type"] = "application/json"
        
        try:
            hr = requests.post(
                "https://www.smartprix.com/api/arc/price-history",
                headers=h_headers,
                json={"pid": pid, "type": "bdp"},
                timeout=10
            )
            if hr.status_code == 200:
                h_data = hr.json()
                if h_data.get("status") == "success":
                    price_history = decode_price_history(h_data.get("data", {}))
        except Exception:
            pass

    return {
        "pid": pid,
        "stores": stores,
        "priceHistory": price_history
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)
        
    url = sys.argv[1]
    res = enrich_product(url)
    print(json.dumps(res, ensure_ascii=True))
