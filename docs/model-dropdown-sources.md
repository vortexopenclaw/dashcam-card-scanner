# UI model-choice evidence

Checked 2026-10-21 using `web_search` (first usable route: Exa fallback after the configured Brave backend returned HTTP 402), then `web_extract` on official catalogs. No Firecrawl, credentials, owner media or private reports were used.

This roster supplies **owner-report identity choices**, not recognition profiles or hardware-support promises. Native IDs and exact native strings survive identity deduplication. No native patterns, folders, native recognition data, maximum counts or channel setups are added/changed.

## Manufacturer evidence

The `source` on every row in `src/model-options.ts` points to the official page used for that batch:

- **Viofo:** https://www.viofo.com/pages/support-product — A119/VS1 fixed front-only products, A229/A329 variants, A149 Pro Duo, T330/T340 variants. Configurable 1CH packages such as A329S 1CH are intentionally **not** treated as fixed single-channel hardware.
- **Vantrue:** https://www.vantrue.com/collections/all-dash-cam — Nexus models (UI uses familiar N-model abbreviations); https://www.vantrue.com/collections/only-front-dashcam — Element E1, E1 Lite, E1 Pro and E1 Pro S. S1 Pro and S1 Pro Max also have individual product evidence linked in the module. Their front-only kit names do not establish fixed hardware limits, so no count suggestion is assigned.
- **Thinkware:** https://thinkware.com/global/dash-cam-comparison — current comparison roster, explicitly no rear camera for F70 PRO; individual U3000 PRO, U1000 PRO and Q200 PRO product pages. These expandable models get no count suggestion.
- **BlackVue:** https://blackvue.com/collections/dash-cam — ELITE products, current LTE and Box Pro variants. 1CH kit names alone do not trigger single-channel suggestions.
- **Garmin:** X-series official announcement (linked in module) describes individual lenses and distinguishes app synchronization of separately sold cameras from channels on one card. Model identities corroborated on official product/support pages: [Mini 3](https://www.garmin.com/en-US/p/1223369/), [X110](https://www.garmin.com/en-US/p/1222949/), [X210 support](https://support.garmin.com/en-US/?productID=1033231&tab=), [X310](https://www.garmin.com/en-US/p/1391409/). The announcement supplied readable specifications where product pages exposed mostly navigation text.
- **Nextbase:** https://nextbase.com/dash-cams/ and https://global.nextbase.com/dash-cams/ — Series 2, Piqo and iQ; rear/cabin accessory compatibility explicitly differs by model. No count inferred from this catalog.
- **70mai:** https://www.70mai.com/ — T800, A900/Ultra, A810/Lite, M310/Plus 4K, Omni, S500; https://www.70mai.com/global/a510/ — A510. Capability remains unspecified in this UI supplement.
- **Other existing native brands broadened:** official Rexing R4 and V1P 3rd Generation product pages, Rove R2-4K and R3 product pages, Wolfbox manual index, Vueroid D21 product/support/manual pages. Exact batch URLs live beside the entries. Legacy native choices from other brands remain available through merging; their specifications were not re-audited here.

## Owner-provided prerelease and picture-mode semantics

**E1 Pro S** is included because the owner explicitly requested their upcoming unit; its dropdown suffix/provenance remains **owner-provided prerelease**. Independent official corroboration was found: https://www.vantrue.com/products/element-1-pro-s-4k-dashcam says **Pre-order**, estimated shipping around November 15–20. The official front-only collection lists it, independently grounding the one-channel suggestion. This is not a claim that the camera is shipping or publicly available now. No count is guessed from “E1” in its name.

Vantrue's N4 Pro S [English manual](https://vantrue-app.vantruecam.com/files/manuals/n4pros/Vantrue%20N4%20Pro%20S%20User%20Manual%20English.pdf) was already the documented basis in `brand-options.ts` for Standard/PlatePix picture modes. The new official E1 Pro S page corroborates PlatePix enhancement, not a bitrate tier. UI keys `vantrue-standard` and `vantrue-platepix` serialize to **quality: `other`** plus exact **qualityLabel: `Standard` / `PlatePix`**, in both ordinary and grouped reports. These choices do not open custom text and do not map to normal/high/maximum.

## Coverage limits

Broad curated roster, not an exhaustive world/regional/history inventory; no claim of per-model settings compatibility. Fixed-single suggestions are deliberately conservative. Native observed counts and owner edits (including explicit unknown) take priority. Native catalog failure still leaves the prebuilt UI roster usable. Delayed catalog completion only refreshes options and does not rewrite owner labels/settings.

Verification is build + Vitest/jsdom bridge mocks, including CSS computed styles in light/dark themes. It does not prove WKWebView/VoiceOver behavior, physical-card recognition, model firmware behavior, native networking or successful real uploads. Native files, submission transport/error mapping, release/push/deploy are outside this change.
