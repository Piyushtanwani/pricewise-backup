import sys

packages = [
    'fastapi', 'uvicorn', 'pydantic', 'pandas', 'numpy', 
    'scipy', 'sklearn', 'prophet', 'xgboost', 'statsmodels',
    'pytest'
]

print(f"Python: {sys.version}", flush=True)
for pkg in packages:
    try:
        mod = __import__(pkg)
        ver = getattr(mod, '__version__', 'unknown')
        print(f"  [OK] {pkg} ({ver})", flush=True)
    except Exception as e:
        print(f"  [MISSING] {pkg}: {e}", flush=True)
