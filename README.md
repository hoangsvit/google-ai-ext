# Google One Offer Explorer

A lightweight **WXT + TypeScript** extension for Chrome and Edge (Manifest V3), developed by [ePlus.DEV](https://eplus.dev).

**Purpose:** identify the Google One / Google AI plan names, capacity, prices, and promotional wording **already visible on the user's active page**. The displayed categories are best-effort guesses, **not proof of a Google or Apple promotional entitlement**.

## Features

- Popup in Vietnamese with scan and open-Google-One actions.
- Read-only DOM content script for `https://one.google.com/*`.
- **Network Offer Inspector (beta)** observes eligible commerce request/response bodies on `one.google.com` and `tokenized.play.google.com` and extracts only whitelisted product metadata.
- Local **HAR import** for inspecting exported Google One sessions without uploading the file.
- Local classification: free trial, promotional price, regular paid price, unknown.
- Manual text-analysis fallback when Google changes the page structure.
- Unit tests and CI build with a downloadable Chrome/Edge extension artifact.
- No analytics, cookies, credentials, request/response *modification*, SKU substitution, external telemetry or automatic purchase.

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
3. For network data, **reload the page after enabling the extension**, browse plan details normally, then click **Xem dữ liệu mạng**. An optional Google Play checkout sheet may appear during normal navigation; the extension never opens one by itself.
4. Alternatively open **Phân tích file HAR trên máy** to select a local, privately held Chrome DevTools HAR export. Only metadata fields are displayed; raw data is not persisted or uploaded.
5. If the page layout is unsupported, paste **only the non-sensitive plan description** into the manual parser.
6. Check the **official checkout** for actual currency, price, eligibility, renewal terms, and taxes. Do not rely on detected text to make a purchasing decision.

## Privacy and permissions

- **`activeTab` only**: used when you click the popup. Static scripts run only on `https://one.google.com/*` and `https://tokenized.play.google.com/*`, including matching iframes.
- **No storage permission**: sanitized network metadata resides only in memory in the extension service worker and can be cleared from the popup; it may disappear when Chrome sleeps the worker or restarts. The local HAR file is parsed within the popup and discarded when the popup closes.
- **No network requests** made by extension code; opening the official Google One page is a direct user action.
- **The read-only MAIN-world hooks examine bounded matching HTTP bodies in page memory** to extract product IDs, base-plan IDs, offer IDs, prices, currency and billing period. Raw bodies and offer tokens are not forwarded or persisted. The extension does not modify any requests or responses.
- **No raw HTML, cookie, account email, offer-token, or checkout token** is sent to the popup, disk, or an external server. However, HAR exports themselves may contain such sensitive data: never upload or share them publicly.
- Page scripts could spoof the window-message bridge. Treat all displayed metadata as *untrusted diagnostic hints*, not authoritative billing details.
- The `collectVisibleOffers` code only checks compact, visible plan containers and returns parsed fields.

## Known limitations

- Chrome's browser-side inspector does not run on iPhone Google App / native Android Google One. Google can change page markup, RPC endpoints, pricing format, regional language, and offer visibility without notice. Some plans may be missed or misclassified.
- A text label like `90p` or `75p` is **not evidence** of an actual discount or available purchase.
- The upstream [crhywun/g1-acq](https://github.com/crhywun/g1-acq) is an iOS Shadowrocket response rewrite; this extension **does not** modify Google billing or emulate it.
- Chrome/Edge are the initial supported targets. Safari/iOS requires separate platform integration and testing.
- Automated tests do **not** perform live billing, subscribe, or validate regional promotions.

## Project structure

```text
entrypoints/google-one.content.ts         Read-only DOM extraction on Google One
entrypoints/google-network-main.content.ts MAIN-world passive request/response observer
entrypoints/google-network-bridge.content.ts Whitelisted bridge to extension context
entrypoints/background.ts                 Temporary per-tab network summary buffer
lib/network-offers.ts                     Bounded Google commerce & HAR metadata parser
entrypoints/popup/            Accessible extension popup
lib/offers.ts                 Pure plan text classifier
lib/offers-dom.ts             Visible DOM card discovery
tests/                        Offline unit tests
.github/workflows/build.yml   Build, verify, and publish artifacts
```

PRs welcome. This independent project is not affiliated with Google or Apple.
