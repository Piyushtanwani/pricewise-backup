import sys
import json
import requests
from urllib.parse import urlparse, parse_qs, unquote
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/"
}

def resolve_tracking_link(tracking_url):
    if not tracking_url or not ("l.smartprix.com" in tracking_url or "linkredirect.in" in tracking_url):
        return tracking_url
    try:
        r = requests.get(tracking_url, headers=HEADERS, allow_redirects=False, timeout=5)
        loc = r.headers.get("Location")
        if loc:
            if "dl=" in loc:
                q = parse_qs(urlparse(loc).query)
                if "dl" in q:
                    dl = unquote(q["dl"][0])
                    dl = dl.replace("dl.flipkart.com/dl/", "www.flipkart.com/")
                    return dl
            return loc
    except Exception:
        pass
    return tracking_url

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

def get_category_brand_products(category_slug, brand_slug, limit=12):
    """
    category_slug: 'tablets' or 'tvs'
    brand_slug: 'apple', 'samsung', 'sony', etc.
    """
    url = f"https://www.smartprix.com/{category_slug}/{brand_slug}-brand"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return []
    except Exception:
        return []

    nodes = []
    for part in r.text.split("<script"):
        if '"FinderPage"' in part:
            idx = part.find("{")
            end_idx = part.rfind("}")
            if idx != -1 and end_idx != -1:
                try:
                    data = json.loads(part[idx:end_idx+1])
                    nodes = data.get("$way", {}).get("props", {}).get("item", {}).get("searchResults", {}).get("nodes", [])
                    if nodes:
                        break
                except Exception:
                    pass

    results = []
    for item in nodes[:limit]:
        p_url = item.get("url", "")
        if not p_url:
            continue
        full_url = "https://www.smartprix.com" + p_url if not p_url.startswith("http") else p_url
        
        stores = []
        price_history = []
        pid = item.get("id")
        
        try:
            dr = requests.get(full_url, headers=HEADERS, timeout=10)
            if dr.status_code == 200:
                for part in dr.text.split("<script"):
                    if '"component":"ProductPage"' in part and '"item":' in part:
                        idx = part.find("{")
                        end_idx = part.rfind("}")
                        if idx != -1 and end_idx != -1:
                            try:
                                d_data = json.loads(part[idx:end_idx+1])
                                d_item = d_data.get("$way", {}).get("props", {}).get("item", {})
                                if d_item:
                                    pid = d_item.get("id", pid)
                                    price_comp = d_item.get("priceComparison", {}).get("table", {})
                                    new_stores = price_comp.get("new", [])
                                    base_price = float(d_item.get("price", item.get("price", 0)))
                                    for st in new_stores:
                                        st_info = st.get("store", {})
                                        s_name = st_info.get("name", "Store")
                                        s_slug = st_info.get("slug", s_name.lower().replace(" ", "-"))
                                        s_price = float(st.get("price", base_price))
                                        raw_tracking = st.get("trackingLink", full_url)
                                        s_url = resolve_tracking_link(raw_tracking)
                                        stores.append({
                                            "name": s_name,
                                            "slug": s_slug,
                                            "price": s_price,
                                            "productUrl": s_url,
                                            "mrp": float(d_item.get("mrp", s_price * 1.15)) if "mrp" in d_item else None,
                                            "stockStatus": "IN_STOCK"
                                        })
                                    break
                            except Exception:
                                pass
        except Exception:
            pass

        # Fallback to bestStore if detail table had no stores
        if not stores and item.get("bestStore"):
            bs = item.get("bestStore", {})
            bs_store = bs.get("store", {})
            s_slug = bs_store.get("slug", "amazon")
            s_name = "Amazon" if "amazon" in s_slug else "Flipkart" if "flipkart" in s_slug else "Croma" if "croma" in s_slug else s_slug.capitalize()
            raw_tracking = bs.get("trackingLink", full_url)
            s_url = resolve_tracking_link(raw_tracking)
            stores.append({
                "name": s_name,
                "slug": s_slug,
                "price": float(item.get("price", 0)),
                "productUrl": s_url,
                "mrp": None,
                "stockStatus": "IN_STOCK"
            })

        # Price history
        if pid:
            h_headers = dict(HEADERS)
            h_headers["Origin"] = "https://www.smartprix.com"
            h_headers["Referer"] = full_url
            h_headers["Content-Type"] = "application/json"
            try:
                hr = requests.post(
                    "https://www.smartprix.com/api/arc/price-history",
                    headers=h_headers,
                    json={"pid": pid, "type": "bdp"},
                    timeout=8
                )
                if hr.status_code == 200:
                    h_data = hr.json()
                    if h_data.get("status") == "success":
                        price_history = decode_price_history(h_data.get("data", {}))
            except Exception:
                pass

        features_list = []
        for f in item.get("features", []):
            if isinstance(f, dict) and "text" in f:
                features_list.append(f["text"])
            elif isinstance(f, str):
                features_list.append(f)

        results.append({
            "id": pid or item.get("id"),
            "name": item.get("name"),
            "price": float(item.get("price", 0)),
            "rating": item.get("rating"),
            "imageId": item.get("imageId"),
            "url": full_url,
            "features": features_list,
            "stores": stores,
            "priceHistory": price_history
        })

    return results

if __name__ == "__main__":
    cat = sys.argv[1] if len(sys.argv) > 1 else "tablets"
    brand = sys.argv[2] if len(sys.argv) > 2 else "apple"
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    res = get_category_brand_products(cat, brand, limit)
    print(json.dumps(res, ensure_ascii=False))
