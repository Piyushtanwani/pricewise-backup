import os
import json
import psycopg2
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../backend/.env'))

def get_connection():
    db_url = os.getenv('DATABASE_URL', '')
    if not db_url:
        raise ValueError("DATABASE_URL is not set in backend/.env")

    parsed_url = urlsplit(db_url)
    supported_query = [
        (key, value)
        for key, value in parse_qsl(parsed_url.query, keep_blank_values=True)
        if key.lower() not in {'pgbouncer', 'connection_limit', 'schema'}
    ]
    psycopg_url = urlunsplit(parsed_url._replace(query=urlencode(supported_query)))
    return psycopg2.connect(psycopg_url)

def audit_provenance():
    conn = get_connection()
    cur = conn.cursor()

    # Query all products with their store and history metadata
    cur.execute("""
        SELECT 
            p.id,
            p.name,
            p.brand,
            p.category,
            p.mrp,
            p."bestPrice",
            COUNT(DISTINCT ps.id) AS store_count,
            COUNT(ph.id) AS history_rows,
            MIN(ph.timestamp) AS min_ts,
            MAX(ph.timestamp) AS max_ts,
            COUNT(DISTINCT to_char(ph.timestamp, 'YYYY-MM-DD')) AS unique_dates,
            STRING_AGG(DISTINCT s.name, ', ') AS stores,
            STRING_AGG(DISTINCT ps."productUrl", ' | ') AS urls
        FROM "Product" p
        LEFT JOIN "ProductStore" ps ON ps."productId" = p.id
        LEFT JOIN "Store" s ON s.id = ps."storeId"
        LEFT JOIN "PriceHistory" ph ON ph."productStoreId" = ps.id
        GROUP BY p.id, p.name, p.brand, p.category, p.mrp, p."bestPrice"
        ORDER BY p.name ASC;
    """)

    rows = cur.fetchall()
    manifest = []
    synthetic_count = 0
    genuine_count = 0

    # 11 seed products defined in prisma/seed.ts
    # They have search URLs or unsplash URLs and exactly 366 dates or seed names
    seed_keys = [
        'wh-1000xm5', 'iphone-16-pro-max', 'galaxy-s25-ultra', 'macbook-pro-14',
        'ipad-pro-11', 'airpods-pro-2', 'lg-c4-oled', 'bravia-9-mini-led',
        'alpha-a7-iv', 'eos-r6-mark-ii'
    ]

    for row in rows:
        (
            p_id, name, brand, category, mrp, best_price, 
            store_count, history_rows, min_ts, max_ts, 
            unique_dates, stores, urls
        ) = row

        urls_str = urls or ''
        name_lower = name.lower()

        # Provenance classification:
        # Genuine: Ingested from Smartprix / Live scraping (has smartprix.com or linkredirect.in or direct ASIN/FSN tracking)
        # Synthetic: Seeded via seed.ts with mulberry32 algorithm
        is_seed_product = (
            'smartprix' not in urls_str and 
            'linkredirect.in' not in urls_str and
            (unique_dates == 366 or any(k in name_lower for k in ['wh-1000xm5', 'macbook pro 14', 'bravia 9', 'alpha a7 iv', 'eos r6', 'lg c4 oled', 'ipad pro 11', 'airpods pro 2']))
        )

        provenance = "synthetic_seed" if is_seed_product else "genuine_scraped"
        if is_seed_product:
            synthetic_count += 1
        else:
            genuine_count += 1

        manifest.append({
            "product_id": p_id,
            "name": name,
            "brand": brand,
            "category": category,
            "mrp": float(mrp) if mrp else None,
            "best_price": float(best_price) if best_price else None,
            "provenance": provenance,
            "store_count": store_count,
            "history_rows": history_rows,
            "unique_dates": unique_dates,
            "min_date": str(min_ts) if min_ts else None,
            "max_date": str(max_ts) if max_ts else None,
            "stores": stores.split(', ') if stores else []
        })

    cur.close()
    conn.close()

    output_path = os.path.join(os.path.dirname(__file__), 'provenance_manifest.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            "total_products": len(rows),
            "genuine_count": genuine_count,
            "synthetic_count": synthetic_count,
            "products": manifest
        }, f, indent=2)

    print(f"Audit completed: {len(rows)} products audited.", flush=True)
    print(f"Genuine products: {genuine_count}", flush=True)
    print(f"Synthetic seeded products: {synthetic_count}", flush=True)
    print(f"Manifest written to: {output_path}", flush=True)

if __name__ == '__main__':
    audit_provenance()
