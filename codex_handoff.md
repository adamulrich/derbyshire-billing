# Codex handoff — Derbyshire Water District PWA

## Project purpose

This repository contains a mobile and desktop PWA for a small water district. Staff use it to maintain customer accounts, plan meter-reading routes, record meter readings, calculate billing, process payments, and export billing and usage reports. The hosted frontend is a public GitHub Pages bundle; authentication and shared operational data use Back4App Parse.

## Stack and entry points

- React, TypeScript, Vite; the application is primarily implemented in `src/App.tsx` and styled in `src/styles.css`.
- Parse browser setup and the compatibility shim for browsers without `crypto.randomUUID()` are in `src/lib/parse.ts`. Keep the `events` dependency installed: Parse's SDK needs its EventEmitter implementation bundled for browsers.
- Leaflet maps use OpenStreetMap tiles. PWA manifest and service worker are in `public/manifest.webmanifest` and `public/sw.js`.
- Back4App Cloud Code is `cloud/main.js`. GitHub Actions deployment code is `.github/workflows/deploy-cloud.yml` plus `.github/scripts/deploy-back4app-cloud.mjs`.
- GitHub Pages build/deployment is `.github/workflows/deploy-pages.yml`.

## Local development

1. Install Node.js (the current Pages workflow uses Node 22) and run `npm ci`.
2. Copy `.env.example` to `.env.local` and provide `VITE_PARSE_APPLICATION_ID`, `VITE_PARSE_JAVASCRIPT_KEY`, and `VITE_PARSE_SERVER_URL` for the intended Back4App app.
3. Run `npm run dev` and open the Vite URL, normally `http://localhost:5173`.

`npm run build` runs TypeScript project builds and the Vite production build. `npm run preview` serves `dist` locally. With Parse configuration absent, the app starts in demo mode and uses browser `localStorage`; demo data is local to that browser and is not shared with Back4App. In configured mode it uses Parse and requires a valid signed-in account. The selected app view is persisted locally for navigation continuity.

Do not put Back4App Master Key or Account Key in `VITE_*` variables, `.env.local`, or frontend code. Vite embeds `VITE_*` settings in the public bundle: the Application ID, JavaScript key, and server URL are client configuration, not secret credentials. `.env.example` includes a master-key placeholder only for a local one-time import; never use that variable in the browser.

## Roles and main workflows

- **Meter reader:** read meters, use the ordered route, map, address search and A–Z last-name sorting. Reading entry works in list or map mode; a map pin opens a reading form with the prior value. Pin movement is opt-in. A change above 8,000 CF prompts for confirmation. Previous register values are editable with an intentional double-click/long-press interaction to avoid accidental changes. Meter notes are shared field notes.
- **Bookkeeper:** balances and payments, payment edits, billing export, and reports.
- **Administrator:** all workflows plus customer maintenance, rates and billing periods, user administration, database backup export, and account/role controls. President, Vice President, Treasurer, and Secretary are represented by the shared administrator role.

Customer records support structured service and billing addresses, geocoding coordinates, bookkeeper ID (normalized to lowercase), primary and secondary phone/email, board-member discount eligibility, paperless preference, meter notes, starting/prior balance, and imported census fields. Avoid placing customer examples or personal information in this handoff.

Each reading checkpoint is a separate `ReadingCycle`; each submitted read is retained as a `MeterReading` linked to its customer and cycle. Readings are immediate Parse writes in configured mode. Route order and map coordinates are saved to customer records. The service worker supports the installable PWA shell; it is not an offline write queue, so do not promise offline submission of readings or payments.

## Billing and exports

The default schedule in the current client code is a $265.23 base per four-month period covering the first 4,000 CF, $40 monthly maintenance, usage tiers of $3.50 per 100 CF from 4,001 through 8,000 and $3.93 per 100 CF above 8,000, and a configurable board-member discount (currently $170 per billing period). Billing is in cubic feet (CF), not CCF. Partial usage is prorated by 100 CF. Administrators can manage the rate schedule and cycle period in the app; confirm configured production rates before issuing invoices.

Billing export is one row per account with columns for bill components, unpaid balance carried forward, adjustments, and total due. The accounts view tracks prior balances, payments, and current balances; payment records can be edited. Billing overrides can change the current cycle charge, including credits (negative values); an existing override is updated by its ID. The current form permits an empty reason, since initial batch overrides may not have individual explanations. Customer XLSX export, multi-checkpoint district/account usage reports with tables and formatted Excel exports, and a Parse data backup export are also available.

## Parse / Cloud Code notes

The frontend authenticates through Parse User login. Administrative and financial actions call Cloud Code so privileged user/payment/override/backup operations can use the Master Key on the server. Important functions currently defined in `cloud/main.js` include:

- User management: `adminListUsers`, `adminCreateUser`, `adminUpdateUser`, `adminSetUserActive`, `adminDeleteUser`.
- Financial records: `adminListPayments`, `adminRecordPayment`, `adminUpdatePayment`, `adminListBillingOverrides`, `adminSetBillingOverride`, `adminClearBillingOverride`.
- Customer history and backups: `adminGetCustomerDetails`, `adminExportBackup`.

Cloud functions enforce signed-in and role checks. Preserve these checks when adding or changing privileged operations. The `_User` class should not have public read/write access; do not solve access problems by exposing user data or master credentials. Data collection permissions and Cloud Code role policy must stay aligned with the frontend roles.

## Deployments and GitHub settings

- **Frontend:** `.github/workflows/deploy-pages.yml` runs on pushes to `main` and manual dispatch. Configure repository Actions secrets `VITE_PARSE_APPLICATION_ID`, `VITE_PARSE_JAVASCRIPT_KEY`, and `VITE_PARSE_SERVER_URL`; the workflow fails if they are missing. GitHub Pages must use **GitHub Actions** as its source.
- **Cloud Code:** `.github/workflows/deploy-cloud.yml` runs on `main` when `cloud/main.js` or its deployment files change, and supports manual dispatch. It uses `BACK4APP_ACCOUNT_KEY` and `BACK4APP_APPLICATION_ID` repository secrets, installs the pinned Back4App MCP deployment server and SDK, syntax-checks `cloud/main.js`, then invokes the deployment script. The account key is a privileged deployment credential. Never print it or commit it.
- Cloud Code and frontend have separate workflows. A successful Pages build does not mean Cloud Code was deployed, and a Cloud Code deployment does not publish the frontend. Check the matching Actions run after a change.

## Maintenance guidance

- Preserve immediate writes for customer edits, payments, and meter readings; no delayed sync/cache should be introduced for these financial/operational updates without an explicit product decision.
- Keep all readings per checkpoint, and preserve billing/export math consistency between the billing screen, balances view, CSV, and reports.
- Treat route order, selected view persistence, full-map exit control, map pin-movement toggle, and mobile form readability as user-facing behaviors when changing layout or navigation.
- Avoid committing `.env.local`, generated customer exports/backups, or sensitive customer data. Review `git status` before commits.
- No automated test script is currently defined in `package.json`. The production build is `npm run build`; use it when implementation verification is requested or needed for a deploy.

## Current checkout snapshot

At handoff creation, the worktree was clean. The current source already contains the billing-override update flow that sends an existing `overrideId` and accepts an optional reason. The repo’s README still contains older setup and feature descriptions; use this handoff and the source/workflows as the current reference, and update the README separately if user-facing setup instructions need to be brought in sync.
