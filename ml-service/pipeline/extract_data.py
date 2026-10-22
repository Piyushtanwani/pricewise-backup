import os
import json
import psycopg2
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../backend/.env'))

def extract():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL is not set")

    parsed_url = urlsplit(db_url)
    supported_query = [
        (key, value)
        for key, value in parse_qsl(parsed_url.query, keep_blank_values=True)
        if key.lower() not in {'pgbouncer', 'connection_limit', 'schema'}
    ]
    psycopg_url = urlunsplit(parsed_url._replace(query=urlencode(supported_query)))
    conn = psycopg2.connect(psycopg_url)
    cur = conn.cursor()

    # 1. Extract Products
    cur.execute("""
        SELECT id, name, brand, category, mrp, "bestPrice", rating, "reviewCount", specs, "techSpecs"
        FROM "Product"
        ORDER BY name ASC;
    """)
    product_rows = cur.fetchall()
    products = []
    for r in product_rows:
        products.append({
            "id": r[0],
            "name": r[1],
            "brand": r[2],
            "category": r[3],
            "mrp": float(r[4]) if r[4] is not None else None,
            "bestPrice": float(r[5]) if r[5] is not None else None,
            "rating": float(r[6]) if r[6] is not None else 0.0,
            "reviewCount": int(r[7]) if r[7] is not None else 0,
            "specs": r[8] if r[8] is not None else [],
            "techSpecs": r[9] if r[9] is not None else {}
        })

    # 2. Extract Stores
    cur.execute('SELECT id, name, slug FROM "Store";')
    stores = {r[0]: {"name": r[1], "slug": r[2]} for r in cur.fetchall()}

    # 3. Extract ProductStores
    cur.execute("""
        SELECT id, "productId", "storeId", "currentPrice", mrp, "stockStatus", "productUrl"
        FROM "ProductStore";
    """)
    product_stores = {}
    for r in cur.fetchall():
        product_stores[r[0]] = {
            "id": r[0],
            "productId": r[1],
            "storeId": r[2],
            "storeName": stores.get(r[2], {}).get("name", "Unknown"),
            "storeSlug": stores.get(r[2], {}).get("slug", "unknown"),
            "currentPrice": float(r[3]),
            "mrp": float(r[4]) if r[4] is not None else None,
            "stockStatus": r[5],
            "productUrl": r[6]
        }

    # 4. Extract PriceHistory
    cur.execute("""
        SELECT ph.id, ph."productStoreId", ph.price, ph.timestamp, ps."productId"
        FROM "PriceHistory" ph
        JOIN "ProductStore" ps ON ps.id = ph."productStoreId"
        ORDER BY ph.timestamp ASC;
    """)
    history_by_product = {}
    history_by_product_store = {}

    for r in cur.fetchall():
        h_id, ps_id, price, ts, p_id = r
        point = {
            "id": h_id,
            "price": float(price),
            "timestamp": ts.isoformat(),
            "date": ts.strftime('%Y-%m-%d')
        }

        if p_id not in history_by_product:
            history_by_product[p_id] = []
        history_by_product[p_id].append(point)

        if ps_id not in history_by_product_store:
            history_by_product_store[ps_id] = []
        history_by_product_store[ps_id].append(point)

    cur.close()
    conn.close()

    artifacts_dir = os.path.join(os.path.dirname(__file__), '../artifacts')
    os.makedirs(artifacts_dir, exist_ok=True)

    catalog_path = os.path.join(artifacts_dir, 'catalog_dataset.json')
    with open(catalog_path, 'w', encoding='utf-8') as f:
        json.dump({
            "products": products,
            "product_stores": list(product_stores.values())
        }, f, indent=2)

    timeseries_path = os.path.join(artifacts_dir, 'timeseries_dataset.json')
    with open(timeseries_path, 'w', encoding='utf-8') as f:
        json.dump({
            "by_product": history_by_product,
            "by_product_store": history_by_product_store
        }, f, indent=2)

    print(f"Extracted {len(products)} products and {sum(len(v) for v in history_by_product.values())} price history rows.", flush=True)

if __name__ == '__main__':
    extract()
