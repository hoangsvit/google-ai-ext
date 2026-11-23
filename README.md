# ePlus.DEV — Google One Live Offer Inspector

Chrome / Edge extension using WXT, TypeScript and Manifest V3. Opens Google One and **automatically** detects visible plan cards and supported subscription commerce requests. There is no manual scan button.

## What happens on opening Google One?

1. Visit https://one.google.com/ai or the official Google AI plans page.
2. Content scripts run at document_start and observe supported Google One / Play Commerce fetch and XMLHttpRequest traffic. Only structured product metadata leaves the page.
3. A MutationObserver reads compact visible plan cards when Google One finishes loading or updates its SPA.
4. Sanitized summaries are stored **per tab** in Chrome storage.session. This memory-only store survives MV3 service-worker sleep and is cleared on browser restart.
5. The extension badge shows the number of detected plans; popup automatically loads the existing snapshot and updates when fresh data arrives.

The popup shows metadata from network RPCs separately from offers detected in visible page cards. An RPC event counter increments even if an observed commerce request/response contains NO SKU, so an empty result is not mistaken for a failed network hook.

The last uploaded HAR, one.google.com(4).har, had 8 POST entries. Its two Google subscription batchexecute calls did not include readable product IDs. Google does not necessarily send plan catalog data when a page first opens. The HAR does not confirm a discount or an available promo SKU.

**If Google One was open before installing the extension**, reload that tab once so document_start hooks can observe later traffic. Thereafter normal navigation and SPA updates are automatic.

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
