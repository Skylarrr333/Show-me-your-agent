"""Rebuild SQLite deterministically from the checked-in Kaggle version 1 archive."""
import hashlib, subprocess, sys, tempfile, zipfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
archive = root / 'data/hdb/kaggle-v1.zip'
filename = 'INET4061projectdata(housing_price).csv'
expected = '7b92e29f72ba4167e298e9e1cc1124839b025ebbfa3652622fbeb6eb966189af'
with zipfile.ZipFile(archive) as z:
    raw = z.read(filename)
if hashlib.sha256(raw).hexdigest() != expected:
    raise SystemExit('Dataset checksum mismatch. Refusing import.')
with tempfile.TemporaryDirectory() as tmp:
    csv = Path(tmp) / filename
    csv.write_bytes(raw)
    subprocess.run([sys.executable, str(root/'scripts/import-kaggle-hdb.py'),str(csv),*sys.argv[1:]],cwd=root,check=True)
