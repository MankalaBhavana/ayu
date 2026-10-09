import sys
sys.path.append('backend')
from database import engine
from sqlalchemy import text
try:
    with engine.connect() as conn:
        result = conn.execute(text('SELECT version();')).fetchone()
        print("Connected to PostgreSQL successfully.")
        print("PostgreSQL Version:", result[0])
except Exception as e:
    print("Failed to connect to PostgreSQL:", str(e))
