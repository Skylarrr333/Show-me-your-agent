"""Import the supplied Kaggle CSV into a local, indexed SQLite snapshot (no dependencies)."""
import argparse, csv, hashlib, json, os, re, sqlite3, tempfile
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('csv')
parser.add_argument('--output', default='.propmatch-data/hdb-resales.sqlite')
args = parser.parse_args()
source, target = Path(args.csv), Path(args.output)
target.parent.mkdir(parents=True, exist_ok=True)
fd, tmp = tempfile.mkstemp(prefix='hdb-import-', suffix='.sqlite', dir=target.parent)
os.close(fd)
try:
    db = sqlite3.connect(tmp)
    db.execute('''CREATE TABLE resales (id INTEGER PRIMARY KEY, month TEXT NOT NULL, town TEXT NOT NULL,
        flat_type TEXT NOT NULL, block TEXT NOT NULL, street_name TEXT NOT NULL, storey_range TEXT NOT NULL,
        floor_area_sqm REAL NOT NULL, flat_model TEXT NOT NULL, lease_commence_date INTEGER NOT NULL,
        remaining_lease TEXT NOT NULL, resale_price REAL NOT NULL)''')
    fields = ['month','town','flat_type','block','street_name','storey_range','floor_area_sqm','flat_model','lease_commence_date','remaining_lease','resale_price']
    count = 0
    with source.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != fields:
            raise ValueError('Unexpected CSV columns: refusing to guess field mappings')
        for i, row in enumerate(reader, start=1):
            if None in row or any(not row[k] or not row[k].strip() for k in fields):
                raise ValueError(f'Missing or malformed values at CSV line {i+1}')
            if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', row['month']):
                raise ValueError(f'Invalid month at line {i+1}')
            area, price = float(row['floor_area_sqm']), float(row['resale_price'])
            if not 0 < area < 1000 or not 0 < price < 10000000:
                raise ValueError(f'Invalid numeric value at line {i+1}')
            lease = int(row['lease_commence_date'])
            if not 1900 <= lease <= 2100: raise ValueError(f'Invalid lease year at line {i+1}')
            db.execute('INSERT INTO resales VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                (i,row['month'],row['town'],row['flat_type'],row['block'],row['street_name'],row['storey_range'],area,row['flat_model'],lease,row['remaining_lease'],price))
            count += 1
    if not count: raise ValueError('Empty dataset')
    db.executescript('''CREATE INDEX resales_month ON resales(month DESC,id DESC);
        CREATE INDEX resales_town_month ON resales(town,month DESC,id DESC);
        CREATE INDEX resales_price ON resales(resale_price,id);
        CREATE INDEX resales_area ON resales(floor_area_sqm,id);
        CREATE INDEX resales_type ON resales(flat_type,month DESC,id DESC);
        CREATE TABLE resale_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);''')
    start,end=db.execute('SELECT MIN(month),MAX(month) FROM resales').fetchone()
    metadata = dict(sourceUrl='https://www.kaggle.com/datasets/yingghui233/hdb-resale-pricing-singapore',
        title='HDB resale pricing (Singapore)', version=1, license='Unknown', count=count, firstMonth=start,lastMonth=end,
        sha256=hashlib.sha256(source.read_bytes()).hexdigest(), importedAt=datetime.now(timezone.utc).isoformat(),
        sourceFilename='INET4061projectdata(housing_price).csv', idMeaning='CSV data row number; header is line 1',
        boundary='Historical transactions, not currently available homes. Flat type is not bedroom count. No route or availability evidence.')
    db.execute('INSERT INTO resale_metadata VALUES (?,?)', ('dataset',json.dumps(metadata)))
    db.commit()
    db.execute('ANALYZE')
    db.close()
    os.replace(tmp,target)
    print(json.dumps(metadata,indent=2))
finally:
    if os.path.exists(tmp): os.unlink(tmp)
