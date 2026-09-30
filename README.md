# Derbyshire Water District Billing

A mobile-friendly PWA for meter reading, route planning, customer administration, and QuickBooks-ready billing exports.

## Run locally

```bash
npm install
npm run dev
```

The current build is a functional front-end prototype with local browser persistence. It includes the Parse/Back4App integration seam in the project architecture but runs in demo mode until environment values are added.

The demo opens as an administrator so the **Users & access** view is visible in the sidebar. Use the role pill in the top-right to preview the meter-reader experience. Administrators can add a user, choose Meter reader or Administrator, set an initial password, and disable/enable accounts. Password values are deliberately not persisted in the demo; production creation/reset should call Parse User APIs.

## Billing assumptions

- Base charge: $265.23 per four-month cycle, including the first 4,000 ft³.
- Maintenance: $40 per month, calculated as $160 for a four-month cycle.
- Usage from 4,001–8,000 ft³: $3.50 per 100 ft³.
- Usage above 8,000 ft³: $3.93 per 100 ft³.
- Usage quantities round up to the next 100 ft³ increment for billing.

The live rate page linked in the project brief currently displays an older July 2021 schedule, so the written project requirements are treated as the source of truth for this initial configuration.

## Next backend step

The app now uses these Parse classes as needed: `Customer`, `ReadingCycle`, and `MeterReading`. Create a new checkpoint from **Read meters → New checkpoint**. A checkpoint rolls forward each customer's previous reading, clears the new cycle's current reading, and stores each submitted reading in `MeterReading`.

The route plan uses Leaflet with OpenStreetMap tiles. Customer addresses are geocoded only when an administrator clicks **Locate address** in the customer form; the returned latitude/longitude are saved on the `Customer` record and reused by the map.

Each customer has separate structured service and billing addresses: Address 1, Address 2, City, State, and ZIP. Geocoding uses the service address; the billing address is included separately in the QuickBooks export.

## GitHub Pages deployment

The repository includes a workflow at `.github/workflows/deploy-pages.yml`. In the GitHub repository settings, add these three Actions secrets under **Secrets and variables → Actions**:

- `VITE_PARSE_APPLICATION_ID`
- `VITE_PARSE_JAVASCRIPT_KEY`
- `VITE_PARSE_SERVER_URL`

Then set **Settings → Pages → Source** to **GitHub Actions**. Every push to `main` will build and deploy the PWA.

These values are configuration for a browser application, not true secrets: Vite embeds `VITE_*` values into the public JavaScript bundle. The Parse Application ID, JavaScript key, and server URL are expected to be exposed. Never place the Parse Master Key, database credentials, or other privileged secrets in `.env.local`, GitHub Pages, or frontend code. Protect data with Parse Class-Level Permissions, ACLs, and server-side Cloud Code for privileged operations.
