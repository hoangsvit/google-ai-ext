# Google One Offer Explorer

A lightweight **WXT + TypeScript** extension for Chrome and Edge (Manifest V3), developed by [ePlus.DEV](https://eplus.dev).

**Purpose:** identify the Google One / Google AI plan names, capacity, prices, and promotional wording **already visible on the user's active page**. The displayed categories are best-effort guesses, **not proof of a Google or Apple promotional entitlement**.

## Features

- Popup in Vietnamese with scan and open-Google-One actions.
- Read-only content script restricted to `https://one.google.com/*`.
- Local classification: free trial, promotional price, regular paid price, unknown.
- Manual text-analysis fallback when Google changes the page structure.
- Unit tests and CI build with a downloadable Chrome/Edge extension artifact.
- No analytics, cookies, credentials, hidden APIs, response rewriting, SKU substitution, interception, or automatic purchase.

## Development

Requires **Node.js 22.16+** and npm.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run zip
```

To install locally: run `npm run build`, then open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.

### How to use

1. Sign in to Google One in your normal browser session and open [one.google.com/ai](https://one.google.com/ai).
2. Wait for the offers to load, then click the extension icon → **Quét tab Google One**.
3. Review the classification. If the page layout is unsupported, paste **only the non-sensitive plan description** into the manual parser.
4. Check the **official checkout** for actual currency, price, eligibility, renewal terms, and taxes. Do not rely on detected text to make a purchasing decision.

## Privacy and permissions

- **`activeTab` only**: used when you click the popup; a statically declared content script runs only on `https://one.google.com/*`.
- **No storage permission**: data remains in the temporary popup view and disappears when closed.
- **No network requests** made by extension code; opening the official Google One page is a direct user action.
- **No raw page HTML, cookies, email addresses, or tokens** sent to popup, disk, or an external server.
- The `collectVisibleOffers` code only checks compact, visible plan containers and returns parsed fields.

## Known limitations

- Google can change page markup, pricing format, regional language, and offer visibility without notice. Some plans may be missed or misclassified.
- A text label like `90p` or `75p` is **not evidence** of an actual discount or available purchase.
- The upstream [crhywun/g1-acq](https://github.com/crhywun/g1-acq) is an iOS Shadowrocket response rewrite; this extension **does not** modify Google billing or emulate it.
- Chrome/Edge are the initial supported targets. Safari/iOS requires separate platform integration and testing.
- Automated tests do **not** perform live billing, subscribe, or validate regional promotions.

## Project structure

```text
entrypoints/google-one.content.ts  Read-only plan extraction on Google One
entrypoints/popup/            Accessible extension popup
lib/offers.ts                 Pure plan text classifier
lib/offers-dom.ts             Visible DOM card discovery
tests/                        Offline unit tests
.github/workflows/build.yml   Build, verify, and publish artifacts
```

PRs welcome. This independent project is not affiliated with Google or Apple.
