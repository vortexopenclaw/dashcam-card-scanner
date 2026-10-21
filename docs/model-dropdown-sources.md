# UI model-choice evidence

Checked 2026-10-21 using `web_search` (first usable route: Exa fallback after the configured Brave backend returned HTTP 402), then `web_extract` on official catalogs. No Firecrawl, credentials, owner media or private reports were used.

This roster supplies **owner-report identity choices**, not recognition profiles or hardware-support promises. Native IDs and exact native strings survive identity deduplication. No native patterns, folders, native recognition data, maximum counts or channel setups are added/changed.

## Manufacturer evidence

The original roster batches below used official pages in `src/model-options.ts`. Audited fixed-single rows now take their source and provenance from `src/fixed-single-capabilities.ts` (see the integration audit below):

- **Viofo:** https://www.viofo.com/pages/support-product — A119/VS1 fixed front-only products, A229/A329 variants, A149 Pro Duo, T330/T340 variants. Configurable 1CH packages such as A329S 1CH are intentionally **not** treated as fixed single-channel hardware.
- **Vantrue:** https://www.vantrue.com/collections/all-dash-cam — Nexus models (UI uses familiar N-model abbreviations); https://www.vantrue.com/collections/only-front-dashcam — Element E1, E1 Lite, E1 Pro and E1 Pro S. S1 Pro and S1 Pro Max also have individual product evidence linked in the module. Their front-only kit names do not establish fixed hardware limits, so no count suggestion is assigned.
- **Thinkware:** https://thinkware.com/global/dash-cam-comparison — current comparison roster, explicitly no rear camera for F70 PRO; individual U3000 PRO, U1000 PRO and Q200 PRO product pages. These expandable models get no count suggestion.
- **BlackVue:** https://blackvue.com/collections/dash-cam — ELITE products, current LTE and Box Pro variants. 1CH kit names alone do not trigger single-channel suggestions.
- **Garmin:** X-series official announcement (linked in module) describes individual lenses and distinguishes app synchronization of separately sold cameras from channels on one card. Model identities corroborated on official product/support pages: [Mini 3](https://www.garmin.com/en-US/p/1223369/), [X110](https://www.garmin.com/en-US/p/1222949/), [X210 support](https://support.garmin.com/en-US/?productID=1033231&tab=), [X310](https://www.garmin.com/en-US/p/1391409/). The announcement supplied readable specifications where product pages exposed mostly navigation text.
- **Nextbase:** https://nextbase.com/dash-cams/ and https://global.nextbase.com/dash-cams/ — Series 2, Piqo and iQ; rear/cabin accessory compatibility explicitly differs by model. No count inferred from this catalog.
- **70mai:** https://www.70mai.com/ — T800, A900/Ultra, A810/Lite, M310/Plus 4K, Omni, S500; https://www.70mai.com/global/a510/ — A510. Capability remains unspecified in this UI supplement.
- **Other existing native brands broadened:** official Rexing R4 and V1P 3rd Generation product pages, Rove R2-4K and R3 product pages, Wolfbox manual index, Vueroid D21 product/support/manual pages. Exact batch URLs live beside the entries. Legacy native choices from other brands remain available through merging; their specifications were not re-audited here.

## Owner-provided prerelease and picture-mode semantics

**E1 Pro S** is included because the owner explicitly requested their upcoming unit; its internal provenance records the owner-provided prerelease request; the dropdown displays simply **E1 Pro S**, not technical provenance text. Independent official corroboration was found: https://www.vantrue.com/products/element-1-pro-s-4k-dashcam says **Pre-order**, estimated shipping around November 15–20. The official front-only collection lists it, independently grounding the one-channel suggestion. This is not a claim that the camera is shipping or publicly available now. No count is guessed from “E1” in its name.

Vantrue's N4 Pro S [English manual](https://vantrue-app.vantruecam.com/files/manuals/n4pros/Vantrue%20N4%20Pro%20S%20User%20Manual%20English.pdf) was already the documented basis in `brand-options.ts` for Standard/PlatePix picture modes. The new official E1 Pro S page corroborates PlatePix enhancement, not a bitrate tier. UI keys `vantrue-standard` and `vantrue-platepix` serialize to **quality: `other`** plus exact **qualityLabel: `Standard` / `PlatePix`**, in both ordinary and grouped reports. These choices do not open custom text and do not map to normal/high/maximum.

## Audited positive-only capability integration

The final `core-brands/inventory.json` (451 rows, 77 positives) and final `other-brands/inventory.json` (614 rows, 33 positives), not intermediate discovery batches, supply **110 fixed-single identities across 21 brands** in `src/fixed-single-capabilities.ts`. The existing 17 positive choices and all existing multichannel choices remain represented. Existing label capitalization is retained. The dropdown merges canonical names and documented same-manufacturer aliases case-insensitively, retaining native IDs and exact native report strings. Manufacturer choices already derive from native plus UI options: generated selector tests verify every positive, including new brands, without changing the parent UI.

- [Grouped exact model list with source links](fixed-single-models.md).
- [Machine-readable coverage and exact exclusions/deferred identities](model-capability-coverage.json): 1,065 inventoried rows across 41 research brand groups; 551 unresolved and 404 expandable/multichannel rows are excluded from fixed-single promotion. Exclusion does not remove an existing/native owner identity choice.
- Every positive and alias generates regression cases from the integrated static dataset. Explicit negative native-catalog cases cover expandable 1CH bundles, Vueroid S1, Vantrue S1 Pro/Max, B4K, Miofive S1, Redtiger F7NS/F8, Kenwood DRV-A310W, Nexar Beam2 mini and modern BlackVue expandable hardware.

### Evidence audit and identity restrictions

This integration used cached anonymous public research only, with no new web requests. The static dataset includes source URLs, concise capability summaries, lifecycle and scope; it does not ship raw manual text, footers or contact details. Provenance distinguishes official manuals, official product/support evidence and manufacturer-authored manual mirrors rather than calling every source an official catalog.

- **SpyTec G1W-C:** the cached Amazon-hosted manual explicitly identifies SpyTec. The research's `G1W` group is an OEM family, not a manufacturer: the positive is therefore exposed under **SpyTec**, not generalized to native `G1W G1W-C`, `G1WC` or other clones. Only the documented SpyTec identity gets the prefill; exact input-to-integrated mapping is in the coverage manifest.
- **Garmin 54/65W:** the cached manual's actual title is **GARMIN DASH CAM 45/54/55/65W**, despite its `45-55` URL filename. Its specifications explicitly enumerate 54/55/65W. Separate app-synchronized cameras do not become extra channels on one card.
- **BlackVue:** the cached manufacturer's DR750X Plus announcement explicitly says earlier 1CH hardware lacked the secondary-camera port and contrasts DR750X-1CH with expandable DR750X-1CH Plus. Only the exact verified legacy identities are promoted; no suffix-wide 1CH rule.
- **Papago:** each of the 12 exact GoSafe models has its own cached China-mainland official manual specifying a single lens and installation/connectors for one recorder. This is not authority over global revisions, similarly named models or the whole GoSafe family. Regional scope stays in the static dataset.
- **E1 Pro S:** human-readable label remains unchanged; prerelease provenance stays internal. Its presence is not a recognition or release-availability claim.

## Coverage limits

All rows in these bounded research rowsets have classifications and sources; neither rowset establishes globally complete historical, regional or revision discovery. Only verified positives are added now: unresolved models, non-dashcams, OEM-family names and accessory entries are not bulk-added. Existing/native choices retain their previous semantics. No catalog maximum is installed-channel evidence. Owner edits, explicit Unknown and native observed-role evidence still take precedence; this change does not edit that UI state engine.

Verified with `npm run build`, the full frontend test suite and `git diff --check`. The first full test run exposed an unrelated stale storage mock in the native-to-intake contract test; parent-supplied fix `71e09e5` was cherry-picked separately before the passing full run. No production intake changes were made here. jsdom selector/bridge tests do not establish physical-card recognition or native accessibility acceptance. Cargo, publishing, push, release and deploy are outside this frontend-only integration.
