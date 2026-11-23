# ePlus.DEV — Google One Live Offer Inspector

Chrome / Edge extension using WXT, TypeScript and Manifest V3. Opens Google One and **automatically** detects visible plan cards and supported subscription commerce requests. There is no manual scan button.

## What happens on opening Google One?

1. Visit https://one.google.com/ai or the official Google AI plans page.
2. Content scripts run at document_start and observe supported Google One / Play Commerce fetch and XMLHttpRequest traffic. Only structured product metadata leaves the page.
3. Google may embed product data in initial HTML (`AF_initDataCallback`) and SKU hints in CTA `jslog` attributes. The content script reads and sanitizes these automatically, without running Google scripts. A MutationObserver also reads compact visible plan cards when Google One finishes loading or updates its SPA.
4. Sanitized summaries are stored **per tab** in Chrome storage.session. This memory-only store survives MV3 service-worker sleep and is cleared on browser restart.
5. The extension badge shows the number of detected plans; popup automatically loads the existing snapshot and updates when fresh data arrives.

The popup shows metadata from network RPCs separately from offers detected in visible page cards. An RPC event counter increments even if an observed commerce request/response contains NO SKU, so an empty result is not mistaken for a failed network hook.

The last uploaded HAR, one.google.com(4).har, had 8 POST entries. Its two Google subscription batchexecute calls did not include readable product IDs. Google does not necessarily send plan catalog data when a page first opens. The HAR does not confirm a discount or an available promo SKU.

**If Google One was open before installing the extension**, reload that tab once so document_start hooks can observe later traffic. Thereafter normal navigation and SPA updates are automatic.

## Initial-HTML bootstrap catalog (November 23, 2026)

The supplied saved HTML file contains Google One's initial `AF_initDataCallback`
data, including nested JSON **string literals** for the subscription products.
The extension now safely parses those product strings **without executing Google
scripts**, strips all fields except the allowlisted product/price metadata and
deduplicates repeated records. It also reads product identifiers from the
`jslog` attributes of compact plan buttons.

The six distinct SKUs observed in that snapshot are:

| SKU | Plan | Visible metadata price | Billing |
|---|---|---|---|
| `g1.helium.m` | AI Plus 400 GB | 132.000 ₫ | P1M |
| `g1.helium.a` | AI Plus 400 GB | 1.319.000 ₫ | P1Y |
| `g1.2tb.ai` | AI Pro 5 TB | 489.000 ₫ | P1M |
| `g1.2tb.ai.annual` | AI Pro 5 TB | 5.000.000 ₫ | P1Y |
| `g1.20tb.v2` | AI Ultra 20 TB | 2.250.000 ₫ | P1M |
| `g1.ai.pro` | AI Ultra 30 TB | 5.500.000 ₫ | P1M |

These are *observed product metadata*, not proof of entitlement, final taxes,
promotional discounts or a completed purchase. A product appearing in the
bootstrap catalog does not guarantee Google will permit checkout at that price.
The original saved HTML, account attributes and billing tokens are **not committed**;
tests use synthetic, sanitized equivalents.

## Popup interface — SKU Explorer

The Chrome/Edge popup has one main scrollbar (no nested SKU-scroll area):
- **Connection and summary:** current-session SKU count, historically observed
  Play Commerce products, and distinct known product IDs.
- **Latest attempt:** a separate result panel tracks whether the official CTA
  was found/clicked, an RPC was observed, or no request was sent. HTTP status
  is not proof of purchase.
- **Live SKU catalog:** real-time **search** by plan, SKU, price, base plan or
  HAR reference; four clickable evidence filters: **Tất cả**, **Phiên này**,
  **Có Commerce**, **HTML**.
- **Per-SKU cards:** plan name, product ID, price/period, current-session
  vs prior-HAR evidence, source HAR and base plan. Historical entries remain
  visible and can be inspected with **Thử** without claiming Google accepted
  a purchase.
- **Advanced details:** network metadata, DOM offers, local HAR import and
  session clear are collapsed by default to keep the popup usable.

All filters and search operate on sanitized extension metadata, without
sending a new network request. The **Thử** action retains its existing,
restricted behavior: use an official Google One plan button if present;
otherwise explicitly report **Chưa gửi**.

## Catalog SKU sources and evidence (23/11/2026)

The catalog includes **9 unique Google One product IDs and 10 plan/price
choices** from five locally inspected HARs and the saved Google One HTML.
No additional verified product ID was found beyond the existing catalog,
so the extension now labels their actual **source and evidence** instead
of adding invented SKUs.

| SKU | Evidence | Historical source |
|---|---|---|
| `g1.20tb.v2` | HTML + Play Commerce RPC | `one.google.com.har`, `one.google.com(1).har` |
| `g1.play.sapphire` | Play Commerce RPC | `one.google.com(2).har` |
| `g1.play.2tb.ai.student` | Play Commerce RPC (monthly and monthly-transit prices) | `one.google.com(2).har` |
| `g1.play.helium.student` | Play Commerce RPC | `one.google.com(3).har` |
| `g1.helium.m`, `g1.helium.a`, `g1.2tb.ai`, `g1.2tb.ai.annual`, `g1.ai.pro` | HTML catalog; `g1.2tb.ai` also seen in subscriptions RPC | Saved HTML / HAR |

A Commerce RPC **HTTP 200** in a saved HAR means there was a response to
a Commerce request. It is *not* a successful purchase, proof of user
eligibility, or a reusable purchase request. The popup now places live
SKUs first and marks historical Commerce-backed SKUs separately from
HTML-only SKUs. No raw HAR data, cookies or checkout tokens are included.

## One-click SKU research list

The popup shows every SKU from the previously observed and sanitized Google One
HTML/HAR records, even when Google does not include that SKU in the current session.
Current-session SKUs are also merged automatically. Every row has **one "Thử"**
button; no dropdown, preview step, or separate launch button is needed.

Clicking "Thử" only looks for an **existing visible Google One entry button**
with the exact SKU in its \`jslog\` metadata and the corresponding price near
that same button. When exactly one safe button matches, it clicks that existing
Google button, potentially opening Google's official checkout. It **never**
automatically confirms or completes a purchase.

Older SKUs are clearly marked *tham khảo*; a historical or unlisted SKU is not
proof that Google currently offers it or that the account is eligible. If
there is no matching official button, the popup reports that result instead
of assembling a private Play Billing request, guessing a URL, or substituting
a different SKU/price. Tokens, cookies and payment data are never replayed.

## What the Try button actually confirms

The extension records a short (45-second) per-tab attempt window when **Thử**
is pressed. It inspects matching Google One `SubscriptionsManagementUi` and
Google Play `PlayCommerceAcquireUi` RPCs without modifying, replaying or
logging raw billing bodies. It reports the allowlisted endpoint, HTTP status,
and whether a product ID appeared in sanitized metadata. The trial is kept
in MV3 session memory and its state is preserved briefly across navigation.

- **Chưa gửi yêu cầu** means Google had no official matching plan-entry
  control for that SKU and price (even after selecting the correct period).
- **Đã nhấn nút, chưa quan sát request** means the local click occurred but
  no matching commerce RPC was observed.
- **Đã quan sát RPC / HTTP ...** means an RPC was observed within the
  trial window. It **does not prove that RPC was caused by the click** or
  that the chosen SKU, price or eligibility were accepted. HTTP 200 on a
  `batchexecute` endpoint can still contain an application-level rejection.
- No checkout or payment is submitted or completed by the extension.
  Only Google can confirm a valid subscription checkout and final pricing.

The provided HAR showed session-bound `skuDetailsToken` and
`offerIdToken` values in private billing payloads. A bare product ID
cannot reconstruct a valid authenticated purchase request. This PR
intentionally does not fabricate or substitute these tokens.

## Other features

- Local offline HAR import. Raw HAR may include secrets: never publish it.
- Evidence-based comparison of prices and base plans. A 122.000 VND base plan seen in an earlier HAR does not imply the current account can subscribe.
- Optional, user-approved official Google One plan selection. It can highlight a matching visible CTA and open it after your confirmation; it does not build private billing requests or auto-pay.
- All fictional DEMO plans, simulation controls, and Response Rewrite Lab have been removed.

## Privacy and permissions

- activeTab allows explicitly requested interaction with the active Google One tab.
- storage allows memory-only storage.session for sanitized, tab-scoped offer summaries. No sync or persistent local storage.
- Content scripts run only on official Google One and allowlisted Google Play Commerce iframe origins.
- No cookie, payment data, authentication token, raw request body, HAR, full HTML, or account details are stored or sent externally.
- The extension observes allowed requests, not server eligibility: Google remains authoritative for promotional availability, price, taxes and payment.

## Development

    npm install
    npm run check
    npm run zip

Load the .output/chrome-mv3 directory in chrome://extensions -> Developer mode -> Load unpacked. The GitHub Actions workflow also publishes a ZIP and unpacked artifact for each pull request.

Project: https://github.com/hoangsvit/google-ai-ext
