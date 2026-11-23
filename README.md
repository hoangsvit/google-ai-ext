# Google One Offer Explorer

A lightweight **WXT + TypeScript** extension for Chrome and Edge (Manifest V3), developed by [ePlus.DEV](https://eplus.dev).

**Purpose:** identify the Google One / Google AI plan names, capacity, prices, and promotional wording **already visible on the user's active page**. The displayed categories are best-effort guesses, **not proof of a Google or Apple promotional entitlement**.

## Features

- Popup in Vietnamese with scan and open-Google-One actions.
- Read-only DOM content script for `https://one.google.com/*`.
- **Network Offer Inspector (beta)** observes eligible commerce request/response bodies on `one.google.com` and `tokenized.play.google.com`, extracts only whitelisted product metadata and compares introductory pricing phases.
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
4. Check the offer classification. A discount is only inferred when multiple pricing phases show an explicit lower introductory price. An Offer ID by itself does not confirm a discount.
5. Alternatively open **Phân tích file HAR trên máy** to select a local, privately held Chrome DevTools HAR export. Only metadata fields are displayed; raw data is not persisted or uploaded.
6. If the page layout is unsupported, paste **only the non-sensitive plan description** into the manual parser.
7. Check the **official checkout** for actual currency, price, eligibility, renewal terms, and taxes. Do not rely on detected text to make a purchasing decision.

## Privacy and permissions

- **`activeTab` only**: used when you click the popup. Static scripts run only on `https://one.google.com/*` and `https://tokenized.play.google.com/*`, including matching iframes.
- **No storage permission**: sanitized network metadata resides only in memory in the extension service worker and can be cleared from the popup; it may disappear when Chrome sleeps the worker or restarts. The local HAR file is parsed within the popup and discarded when the popup closes.
- **No network requests** made by extension code; opening the official Google One page is a direct user action.
- **The read-only MAIN-world hooks examine bounded matching HTTP bodies in page memory** to extract product IDs, base-plan IDs, offer IDs, prices, currency and billing period. Raw bodies and offer tokens are not forwarded or persisted. The extension does not modify any requests or responses.
- **No raw HTML, cookie, account email, offer-token, or checkout token** is sent to the popup, disk, or an external server. However, HAR exports themselves may contain such sensitive data: never upload or share them publicly.
- Page scripts could spoof the window-message bridge. Treat all displayed metadata as *untrusted diagnostic hints*, not authoritative billing details.
- The `collectVisibleOffers` code only checks compact, visible plan containers and returns parsed fields.

## Local demo offer (no Google checkout)

In the popup's **Network Offer Inspector**, select one demo plan and click **"Thử gói DEMO"**. A **fictional** `g1.demo.ultra.3m` product with a `demo-3months` offer ID will be processed through the same network parsing and price-phase assessment pipeline. It demonstrates a sample introductory price of **$19.99/month for 3 months** followed by a sample **$199.99/month** renewal. Neither price nor product is a genuine Google offer.

The sample menu also offers *AI Pro 5 TB (489k vs 122k VND base plans)*, *AI Pro 5 TB with YouTube Premium (159k)* and *AI Plus 400 GB (132k)* using sanitized, fictional product IDs. They are modeled on observed plan metadata in the user's latest HAR but never imply checkout eligibility.

The DEMO card is visually marked, cannot be purchased, is never inserted into the actual page's network responses, does not alter SKU/checkout, and is not stored or transmitted. Clicking **Xem dữ liệu mạng** returns to actual captured data.

## Offer assessment based on real pricing phases

The inspector now categorizes each product into:

- **Standard plan:** normal billed price and no separate promotional pricing phase was observed.
- **Free trial:** a zero-cost introductory phase precedes a paid phase.
- **Introductory discount:** a lower first phase precedes a higher subsequent phase.
- **Offer candidate:** an `offerId` is present, but the data does not prove a reduced price.
- **Unknown:** insufficient structured metadata to determine pricing.

A **Google One checkout remains the final authority** on eligibility, taxes, billing schedule, and whether an offer can be purchased. The extension never substitutes a SKU, constructs a signed checkout payload, or silently clicks Subscribe.

### Findings from the latest user-provided HAR (November 23, 2026)

The sanitized structural test fixture corresponds to an observed `SubscriptionsManagementUi` request and `PlayCommerceAcquireUi` checkout sequence:

| Product | Base plan | Price displayed in product metadata | Billing period | Detected promotional offer |
|---|---|---|---|---|
| `g1.20tb.v2` (Google AI Ultra 20 TB) | `p1m` | 2.250.000 ₫ | `P1M` | None in captured data |

The recording does **not** show the iOS `90p` or `75p` SKU variants. Absence from a HAR is not proof the Google account has no other eligible offers. Checkout may add taxes or different payment terms.

**Privacy:** no original HAR, cookies, tokens, account identifiers, or transaction payloads are committed to this repository. Tests use manually constructed synthetic records with the same relevant shape.

## Findings from additional HAR: AI Pro 5 TB, YouTube Premium and AI Plus

The user's third Google One capture (`one.google.com(2).har`, analyzed locally on 23 November 2026) contains **22 POST requests**, including six Google One subscription RPCs and two Google Play Commerce checkout RPCs. Sanitized product information:

| Plan seen in the captured request | Product ID | Base plan | Displayed monthly price |
|---|---|---|---|
| Google AI Pro 5 TB + YouTube Premium | `g1.play.sapphire` | `monthly-transit` | 159.000 ₫ |
| Google AI Pro 5 TB | `g1.play.2tb.ai.student` | `monthly` | 489.000 ₫ |
| Google AI Pro 5 TB | `g1.play.2tb.ai.student` | `monthly-transit` | 122.000 ₫ |
| Google AI Plus 400 GB | `g1.play.helium.student` | `monthly` | 132.000 ₫ |

**Important:** `monthly` and `monthly-transit` are **distinct base plans**, not two chronological phases of one offer. Their 489k/122k difference is about 75.1%, but does not demonstrate an account can select the cheaper base plan or that a fixed-term promotion exists. Product details seen in a request do not prove successful checkout. The extension now compares same-product, same-currency, same-cycle base plans and explicitly labels eligibility as unverified.

The original HAR was **not committed**. Offline tests contain constructed data with the same relevant plan metadata, with no cookies, email addresses, tokens or purchase IDs.

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
lib/offer-assessment.ts                    Price-phase classification; no eligibility claims
lib/base-plan-comparison.ts                Compare distinct eligible-looking base-plan price options
entrypoints/popup/            Accessible extension popup
lib/offers.ts                 Pure plan text classifier
lib/offers-dom.ts             Visible DOM card discovery
tests/                        Offline unit tests
.github/workflows/build.yml   Build, verify, and publish artifacts
```

PRs welcome. This independent project is not affiliated with Google or Apple.
