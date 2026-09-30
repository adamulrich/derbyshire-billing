"""One-time census importer for Derbyshire Water District.

Run locally with:
    py -3 scripts/import_census.py "C:\\path\\to\\census.csv"

The importer reads PARSE_MASTER_KEY from .env.local. It is intentionally not a
VITE_ variable and must never be committed or sent to the browser.
"""

import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, '.env.local')
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
PARSE_USER_AGENT = 'DerbyshireWaterDistrictBilling/1.0 (one-time customer import)'


def load_env(path):
    values = {}
    if not os.path.exists(path):
        return values
    with open(path, encoding='utf-8') as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def clean(value):
    return (value or '').strip()


def parse_city_state_zip(value):
    match = re.match(r'^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$', clean(value))
    if not match:
        raise ValueError(f'Could not parse city/state/ZIP: {value!r}')
    return match.group(1).strip(), match.group(2).upper(), match.group(3)


def geocode(street, city_state_zip):
    query = f'{street}, {city_state_zip}, USA'
    params = urllib.parse.urlencode({
        'format': 'jsonv2',
        'limit': 1,
        'countrycodes': 'us',
        'q': query,
    })
    request = urllib.request.Request(
        f'{NOMINATIM_URL}?{params}',
        headers={'User-Agent': PARSE_USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        results = json.load(response)
    if not results:
        raise ValueError(f'No geocoding match for {query}')
    result = results[0]
    return float(result['lat']), float(result['lon']), result.get('display_name', '')


def customer_payload(row, index, lat, lng, display_name):
    service_city, service_state, service_zip = parse_city_state_zip(row['City, State, Zip'])
    name = f"{clean(row['First Name'])} {clean(row['Last Name'])}".strip()
    service_address = clean(row['Service Address '])
    paperless_header = next(key for key in row if key.startswith('Paperless billing opt in'))
    payload = {
        'name': name,
        'address': f'{service_address}, {service_city}, {service_state} {service_zip}',
        'serviceAddress1': service_address,
        'serviceAddress2': '',
        'serviceCity': service_city,
        'serviceState': service_state,
        'serviceZip': service_zip,
        'billingSameAsService': False,
        'billingAddress1': clean(row['Mailing Address']),
        'billingAddress2': '',
        'billingCity': clean(row['City']),
        'billingState': clean(row['ST']).upper(),
        'billingZip': clean(row['Zip']),
        'phone': clean(row['Phone 1']) or clean(row['Phone 2']),
        'email': clean(row['Email 1']) or clean(row['Email 2']),
        'previous': 0,
        'current': None,
        'lastRead': None,
        'route': index,
        'lat': lat,
        'lng': lng,
        'accountNumber': clean(row['Acct #  or User ID']),
        'partTimeFullTime': clean(row['Part time or Full time?']),
        'meterInstalled': clean(row['Meter Installed?']),
        'residents': clean(row['How Many Residents?']),
        'ownerTenant': clean(row['Owner or Tenant?']),
        'notes': clean(row['Notes']),
        'business': clean(row['Business']),
        'parcelId': clean(row['Parcel ID']),
        'connectionStatus': clean(row['Connection Status']),
        'phone2': clean(row['Phone 2']),
        'email2': clean(row['Email 2']),
        'paperlessBilling': clean(row[paperless_header]),
        'geocodeSource': 'Nominatim / OpenStreetMap',
        'geocodeDisplayName': display_name,
        'geocodedAt': time.strftime('%Y-%m-%d'),
    }
    return {key: value for key, value in payload.items() if value != ''}


def parse_request(base_url, application_id, master_key, method, path, body=None):
    headers = {
        'X-Parse-Application-Id': application_id,
        'X-Parse-Master-Key': master_key,
        'Content-Type': 'application/json',
    }
    data = json.dumps(body).encode('utf-8') if body is not None else None
    request = urllib.request.Request(f'{base_url.rstrip("/")}{path}', data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'Parse API {error.code}: {detail}') from error


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: py -3 scripts/import_census.py "path-to-csv"')
    csv_path = os.path.abspath(sys.argv[1])
    if not os.path.exists(csv_path):
        raise SystemExit(f'CSV not found: {csv_path}')

    env = load_env(ENV_PATH)
    required = ['VITE_PARSE_APPLICATION_ID', 'VITE_PARSE_SERVER_URL', 'PARSE_MASTER_KEY']
    missing = [key for key in required if not env.get(key)]
    if missing:
        raise SystemExit('Missing local environment values: ' + ', '.join(missing))

    with open(csv_path, newline='', encoding='utf-8-sig') as source:
        rows = list(csv.DictReader(source))
    if not rows:
        raise SystemExit('The CSV contains no data rows.')

    payloads = []
    for index, row in enumerate(rows, 1):
        street = clean(row['Service Address '])
        city_state_zip = clean(row['City, State, Zip'])
        lat, lng, display_name = geocode(street, city_state_zip)
        payloads.append(customer_payload(row, index, lat, lng, display_name))
        print(f'Geocoded {index}/{len(rows)}: {street} -> {lat:.7f}, {lng:.7f}', flush=True)
        if index < len(rows):
            time.sleep(1.05)

    base_url = env['VITE_PARSE_SERVER_URL']
    app_id = env['VITE_PARSE_APPLICATION_ID']
    batch_size = 50
    imported = 0
    for start in range(0, len(payloads), batch_size):
        batch = payloads[start:start + batch_size]
        requests = [
            {'method': 'POST', 'path': '/parse/classes/Customer', 'body': payload}
            for payload in batch
        ]
        results = parse_request(base_url, app_id, env['PARSE_MASTER_KEY'], 'POST', '/parse/batch', {'requests': requests})
        failures = [result for result in results if 'error' in result]
        if failures:
            raise RuntimeError('Parse batch import failed: ' + json.dumps(failures, ensure_ascii=False))
        imported += len(batch)
        print(f'Imported {imported}/{len(payloads)} customers', flush=True)

    print(f'Complete: imported {imported} customers.')


if __name__ == '__main__':
    main()
