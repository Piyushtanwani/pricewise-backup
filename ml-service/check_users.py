import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../backend/.env'))

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

cur.execute('SELECT COUNT(*) FROM "User";')
users = cur.fetchone()[0]

cur.execute('SELECT COUNT(*) FROM "Wishlist";')
wishlist = cur.fetchone()[0]

cur.execute('SELECT COUNT(*) FROM "Watchlist";')
watchlist = cur.fetchone()[0]

cur.execute('SELECT COUNT(*) FROM "Alert";')
alerts = cur.fetchone()[0]

print(f"PostgreSQL Counts -> Users: {users}, Wishlists: {wishlist}, Watchlists: {watchlist}, Alerts: {alerts}")
cur.close()
conn.close()
