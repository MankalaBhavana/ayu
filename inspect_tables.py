import sys
sys.path.append('backend')
from database import engine
from sqlalchemy import inspect
try:
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print("Tables in PostgreSQL:", tables)
except Exception as e:
    print("Error:", str(e))
