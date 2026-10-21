// SPDX-License-Identifier: AGPL-3.0-only
// Positive-only audited public research snapshot; not recognition authority.
export type FixedSingleCapability={manufacturer:string;model:string;aliases?:string[];sources:string[];provenance:'official-manual'|'manufacturer-manual-mirror'|'official-product-support';scope:string;evidence:string;lifecycle:string};
export const fixedSingleCapabilities:FixedSingleCapability[]=[
  {
    "manufacturer": "70mai",
    "model": "Lite",
    "sources": [
      "https://cdn-www.70mai.com/instructions/70maiDashCamLiteUserManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official exact-model manual Product Overview enumerates one lens and power interface plus memory-card slot (or internal eMMC for M500), without a secondary-camera connection or installation; single sensor/resolution recording specification.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "70mai",
    "model": "M300",
    "sources": [
      "https://cdn-www.70mai.com/instructions/70maiDashCam_M300_UserManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official exact-model manual Product Overview enumerates one lens and power interface plus memory-card slot (or internal eMMC for M500), without a secondary-camera connection or installation; single sensor/resolution recording specification.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "70mai",
    "model": "M310",
    "sources": [
      "https://cdn-www.70mai.com/instructions/70maiDashCam_M310_UserManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official exact-model manual Product Overview enumerates one lens and power interface plus memory-card slot (or internal eMMC for M500), without a secondary-camera connection or installation; single sensor/resolution recording specification.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "70mai",
    "model": "M310 Plus 2K",
    "sources": [
      "https://www.70mai.com/global/m310plus2K/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official page specifies one manually rotatable lens and explicitly explains rear recording requires mounting this standalone camera on the rear windshield for users not switching to a dual-camera system; extension cable is for that independent camera, not another video channel.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "70mai",
    "model": "M310 Plus 3K",
    "sources": [
      "https://www.70mai.com/global/m310plus3K/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official page specifies one manually rotatable lens and explicitly explains rear recording requires mounting this standalone camera on the rear windshield for users not switching to a dual-camera system; extension cable is for that independent camera, not another video channel.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "70mai",
    "model": "M310 Plus 4K",
    "sources": [
      "https://www.70mai.com/global/m310plus4K/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official page specifies one manually rotatable lens and explicitly explains rear recording requires mounting this standalone camera on the rear windshield for users not switching to a dual-camera system; extension cable is for that independent camera, not another video channel.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "70mai",
    "model": "M500",
    "sources": [
      "https://cdn-www.70mai.com/instructions/70maiDashCam_M500_UserManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official exact-model manual Product Overview enumerates one lens and power interface plus memory-card slot (or internal eMMC for M500), without a secondary-camera connection or installation; single sensor/resolution recording specification.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR450-1CH",
    "sources": [
      "https://media.blackvue.com/blackvue-dr450-1ch-manual/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR590-1CH",
    "sources": [
      "https://media.blackvue.com/blackvue-dr590-1ch-manual/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR590W-1CH",
    "sources": [
      "https://media.blackvue.com/blackvue-dr590w-1ch-manual/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR590X-1CH",
    "sources": [
      "https://manual.blackvue.com/docs/dr590x-2ch/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR650GW-1CH",
    "sources": [
      "https://media.blackvue.com/blackvue-dr650gw-1ch-manual/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR650S-1CH",
    "sources": [
      "https://media.blackvue.com/blackvue-dr650s-1ch-manual/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR750S-1CH",
    "sources": [
      "https://media.blackvue.com/blackvue-dr750s-1ch-manual/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR750X-1CH",
    "sources": [
      "https://manual.blackvue.com/docs/dr750x-1ch/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR900S-1CH",
    "sources": [
      "https://media.blackvue.com/blackvue-dr900s-1ch-manual/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "BlackVue",
    "model": "DR900X-1CH",
    "sources": [
      "https://manual.blackvue.com/docs/dr900x-1ch/",
      "https://media.blackvue.com/new-dr750x-plus-series-full-hd-cloud-dashcam-now-available/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Manufacturer explicitly states before DR750X Plus, 1CH models were 1CH-only without secondary-camera port; this exact dedicated 1CH legacy identity is listed in official manual index.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Blueskysea",
    "model": "B1W",
    "sources": [
      "https://blueskysea-inc.com/download/user-manual_c0001",
      "https://m.blueskysea-inc.com/b1w-p00097p1.html"
    ],
    "provenance": "official-product-support",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official detailed product specification describes a compact single rotating 1080p camera (IMX323), one unit powered by USB, no rear-camera input, second-camera package or dual mode in complete page. Distinct from dual B2W and rear-expandable B4K.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Cansonic",
    "model": "UltraDash C1",
    "sources": [
      "https://cansonic.com/pages/download",
      "https://cdn.shopify.com/s/files/1/0013/5715/2292/files/C1_manual_online.pdf?3592224849593454044="
    ],
    "provenance": "official-manual",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official complete manual hardware and installation reviewed: one camera lens, power/data USB port, no second-camera input or recording mode. C1 magnetic connector is mount/power, not rear-camera expansion.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Cansonic",
    "model": "UltraDash S1",
    "sources": [
      "https://cansonic.com/pages/download",
      "https://cdn.shopify.com/s/files/1/0013/5715/2292/files/S1_manual_online_English.pdf?2891834108790637431="
    ],
    "provenance": "official-manual",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official complete manual hardware and installation reviewed: one camera lens, power/data USB port, no second-camera input or recording mode. C1 magnetic connector is mount/power, not rear-camera expansion.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Cobra",
    "model": "Road Scout",
    "sources": [
      "https://www.cobra.com/pages/product-help-manuals?_ab=0&_fd=0&_sc=1",
      "https://support.cobra.com/support/solutions/47000523789",
      "https://www.quadratec.com/"
    ],
    "provenance": "manufacturer-manual-mirror",
    "scope": "global/unspecified; see brand status",
    "evidence": "Cobra-authored owner manual mirrored by retailer: single adjustable camera lens in combined radar detector; power SmartCord/USB service, no second-camera input or dual recording.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Cobra",
    "model": "SC 100",
    "sources": [
      "https://www.cobra.com/pages/product-help-manuals",
      "https://cdn.shopify.com/s/files/1/2203/2035/files/SC100_WEB_MANUAL.pdf?v=1698941102"
    ],
    "provenance": "official-manual",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official full manual hardware interface specifies one camera lens and USB power/data; no accessory-camera input. SC100 manual comparison confines optional Flex cameras to SC200/400 family. SC100 can be physically aimed front OR rear, not simultaneous two channels.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Cobra",
    "model": "SC 120",
    "sources": [
      "https://www.cobra.com/pages/product-help-manuals",
      "https://cdn.shopify.com/s/files/1/2203/2035/files/SC120_WEB_MANUAL_FIN_REV_08624_3b9ddaa9-4365-47bd-8db3-575642a91cbc.pdf?v=1724186794"
    ],
    "provenance": "official-manual",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official full manual hardware interface specifies one camera lens and USB power/data; no accessory-camera input. SC100 manual comparison confines optional Flex cameras to SC200/400 family. SC100 can be physically aimed front OR rear, not simultaneous two channels.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "MINI",
    "sources": [
      "https://www.ddpai.com/manuals/mini/",
      "https://cn.ddpai.com/cn/product-support/mini/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official full model-specific manual product overview and specifications enumerate single lens and only power/data interface (no rear-camera input); one-camera installation and recording architecture. Do not propagate to similarly named Pro/OEM/2026 revisions.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "MINI2X",
    "sources": [
      "https://www.ddpai.com/manuals/mini2x/",
      "https://cn.ddpai.com/cn/product-support/mini2x/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official full model-specific manual product overview and specifications enumerate single lens and only power/data interface (no rear-camera input); one-camera installation and recording architecture. Do not propagate to similarly named Pro/OEM/2026 revisions.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "MINI3",
    "sources": [
      "https://www.ddpai.com/manuals/mini3/",
      "https://cn.ddpai.com/cn/product-support/mini3/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official full model-specific manual product overview and specifications enumerate single lens and only power/data interface (no rear-camera input); one-camera installation and recording architecture. Do not propagate to similarly named Pro/OEM/2026 revisions.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "MINI3X (V3)",
    "sources": [
      "https://www.ddpai.com/manuals/mini3x/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official full model-specific manual product overview and specifications enumerate single lens and only power/data interface (no rear-camera input); one-camera installation and recording architecture. Do not propagate to similarly named Pro/OEM/2026 revisions.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "MINI5",
    "sources": [
      "https://www.ddpai.com/manuals/mini5/",
      "https://cn.ddpai.com/cn/product-support/mini5/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official full model-specific manual product overview and specifications enumerate single lens and only power/data interface (no rear-camera input); one-camera installation and recording architecture. Do not propagate to similarly named Pro/OEM/2026 revisions.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "MINI7X",
    "sources": [
      "https://www.ddpai.com/manuals/mini7x/",
      "https://cn.ddpai.com/cn/product-support/mini-7x/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official full model-specific manual product overview and specifications enumerate single lens and only power/data interface (no rear-camera input); one-camera installation and recording architecture. Do not propagate to similarly named Pro/OEM/2026 revisions.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "MINIONE",
    "sources": [
      "https://www.ddpai.com/manuals/minione/",
      "https://cn.ddpai.com/cn/product-support/minione/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official full model-specific manual product overview and specifications enumerate single lens and only power/data interface (no rear-camera input); one-camera installation and recording architecture. Do not propagate to similarly named Pro/OEM/2026 revisions.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "DDPAI",
    "model": "N2",
    "sources": [
      "https://www.ddpai.com/manuals/n2/",
      "https://cn.ddpai.com/cn/product-support/n2/"
    ],
    "provenance": "official-manual",
    "scope": "Global English + China mainland support indexes; revision distinctions preserved",
    "evidence": "Official N2 / N2 Dual manual explicitly: Rear Camera Port not available on single-channel models. N2 single hardware is distinguished from N2 Dual, not just rear camera omitted from box.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Escort",
    "model": "M2",
    "sources": [
      "https://www.escortradar.com/pages/product-help-manuals",
      "https://support.escortradar.com/support/solutions/47000523561",
      "https://images.thdstatic.com/catalog/pdfImages/71/71bc64d2-53a0-4ce1-9c86-283302b01cb1.pdf"
    ],
    "provenance": "manufacturer-manual-mirror",
    "scope": "global/unspecified; see brand status",
    "evidence": "Escort-authored full manual mirrored by Home Depot: front-view lens, single-camera hardware interface, microSD and detector power connection; no rear-camera connection/second stream. Radar detector attachment is not camera expansion.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 10",
    "sources": [
      "https://static.garmin.com/pumac/Dash_Cam_10_20_OM_EN.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 20",
    "sources": [
      "https://static.garmin.com/pumac/Dash_Cam_10_20_OM_EN.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 30",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/dashcam35/EN-US/DashCam_30-35_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 35",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/dashcam35/EN-US/DashCam_30-35_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 45",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/dashcam45-55/EN-GB/DashCam_45-55_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 46",
    "sources": [
      "https://www.garmin.com/en-US/newsroom/press-release/automotive/2019-garmin-unveils-a-new-dash-cam-lineup-with-the-dash-cam-465666w-and-dash-cam-mini-the-perfect-eyewitnesses-for-any-drive/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official launch announcement describes each dash cam’s one forward lens and single video resolution; extra viewpoints use separate dash cameras linked through Garmin Drive Auto Sync, each recording independently.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 47",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/GUID-C4D79BA0-3BA1-4AD4-8E26-9B5A95FB9350/EN-US/Dash_Cam_47-57-67W_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 54",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/dashcam45-55/EN-GB/DashCam_45-55_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit. Cached manual title explicitly names 45/54/55/65W, despite its shorter URL filename.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 55",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/dashcam45-55/EN-GB/DashCam_45-55_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 56",
    "sources": [
      "https://www.garmin.com/en-US/newsroom/press-release/automotive/2019-garmin-unveils-a-new-dash-cam-lineup-with-the-dash-cam-465666w-and-dash-cam-mini-the-perfect-eyewitnesses-for-any-drive/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official launch announcement describes each dash cam’s one forward lens and single video resolution; extra viewpoints use separate dash cameras linked through Garmin Drive Auto Sync, each recording independently.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 57",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/GUID-C4D79BA0-3BA1-4AD4-8E26-9B5A95FB9350/EN-US/Dash_Cam_47-57-67W_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 65W",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/dashcam45-55/EN-GB/DashCam_45-55_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit. Cached manual title explicitly names 45/54/55/65W, despite its shorter URL filename.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 66W",
    "sources": [
      "https://www.garmin.com/en-US/newsroom/press-release/automotive/2019-garmin-unveils-a-new-dash-cam-lineup-with-the-dash-cam-465666w-and-dash-cam-mini-the-perfect-eyewitnesses-for-any-drive/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official launch announcement describes each dash cam’s one forward lens and single video resolution; extra viewpoints use separate dash cameras linked through Garmin Drive Auto Sync, each recording independently.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam 67W",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/GUID-C4D79BA0-3BA1-4AD4-8E26-9B5A95FB9350/EN-US/Dash_Cam_47-57-67W_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam Live",
    "sources": [
      "https://www.garmin.com/en-US/blog/automotive/what-is-the-best-car-dash-camera-for-me/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official product guide describes one 1440p camera with one 140-degree lens and LTE live view; multiple viewpoints require separate dash cams.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam Mini",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/dashcammini/EN-US/DashCam_Mini_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam Mini 2",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/GUID-8EFC497C-4031-46EE-AC26-B0AE4B3CE8BD/EN-US/Dash_Cam_Mini_2_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam Mini 3",
    "sources": [
      "https://www.garmin.com/en-US/newsroom/press-release/automotive/capture-detailed-eyewitness-video-with-the-new-garmin-dash-cam-x-series/"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official X-series launch describes the Mini 3 as a one-lens ultra-compact forward dash cam; multicamera support means separate standalone dash cams, not a rear-camera expansion input.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam X110",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/GUID-93747543-12A8-453C-9896-32070F5B0710/EN-US/Dash_Cam_X110_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam X210",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/GUID-AA217031-2399-427F-9108-A3A429839BFE/EN-US/Dash_Cam_X210_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Garmin",
    "model": "Dash Cam X310",
    "sources": [
      "https://www8.garmin.com/manuals/webhelp/GUID-D9E2A866-74A8-4380-BE21-F1522E0149BC/EN-US/Dash_Cam_X310_OM_EN-US.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official owner manual describes one camera/lens recording to its local memory card and USB power/data connection, with no rear/cabin camera input. Where Auto Sync is supported, extra cameras are independent units/cards paired in the phone app, not additional recording channels on this unit.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Miofive",
    "model": "S1 E",
    "aliases": [
      "S1E"
    ],
    "sources": [
      "https://www.miofive.com/pages/download",
      "https://www.miofive.com/collections/all-dashcams",
      "https://www.miofive.com/blogs/faqs/miofive-s1-series-frequently-asked-questions"
    ],
    "provenance": "official-product-support",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official FAQ explicitly: S1 E does not support a rear camera connection.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Nexar",
    "model": "Beam",
    "sources": [
      "https://www.getnexar.com/the-dash-cams",
      "https://help-classic.getnexar.com/en/articles/13577828-nexar-beam-technical-specifications",
      "https://help.getnexar.com/en/articles/10096103-frequently-asked-questions-faqs-about-the-nexar-rearview-camera"
    ],
    "provenance": "official-product-support",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official Beam technical specifications describe one road-facing 2MP camera. Official rear-camera FAQ excludes Classic Beam as main connected camera: owners must purchase One/Beam2/Beam2 mini, and may repurpose Beam AS the rear unit. This is not expansion of Beam as recorder.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Nextbase",
    "model": "101",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-gb/2018/06/NBDVR101-Instruction-Manual-English-R03-1.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "112",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-au/2018/06/NBDVR112-Instruction-Manual-English-R3.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "122",
    "sources": [
      "https://cdn.nextbase.com/nextbase-de-de/2019/06/NBDVR122-DE.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Nextbase",
    "model": "122HD",
    "sources": [
      "https://cdn.nextbase.com/nextbase-de-de/2020/01/NBDVR122HD-User-Manual-English-R1_compressed.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "202",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-gb/2018/06/NBDVR202-Instruction-Manual-English-R04.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "212",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-us/2018/06/NBDVR212-Instruction-Manual-US-English-R1.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "222",
    "sources": [
      "https://cdn.nextbase.com/nextbase-fr-fr/2019/06/NBDVR222-FR.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Nextbase",
    "model": "302G",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-au/2018/06/NBDVR302G-english.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "312GW",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-gb/2018/06/NBDVR312GW-Instruction-Manual-English-R7.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "380GW",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-gb/2018/06/NBDVR380GW-Instruction-Manual-English-R3.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "402G",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-gb/2018/06/NBDVR402G-english.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "412GW",
    "sources": [
      "https://cdn.nextbase.com/nextbase-nl-be/2018/06/NBDVR412GW-Instruction-Manual-English-R10.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "512G",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-au/2018/06/NBDVR512G-Instruction-Manual-R02-English-1.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Nextbase",
    "model": "612GW",
    "sources": [
      "https://cdn.nextbase.com/nextbase-en-us/2018/06/NBDVR612GW-Instruction-Manual-US-English-R1.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact-model official manual product specification and complete Parts/Controls plus installation describe one lens and one recording stream; connectors are power/data and (where present) AV/HDMI OUTPUT, not a rear-camera input. Generic accessory/SD-card boilerplate elsewhere is not used to infer capability.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 100",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS100.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS100.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 110",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS110.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS110.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 115",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS115.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS115.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 130",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS130.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS130.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 150",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS150.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS150.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 260",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS260.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS260.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 272",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS272.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS272.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 510",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS510.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS510.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 520",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS520.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS520.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 525",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS525.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS525.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 530G",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS530G.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS530G.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Papago",
    "model": "GoSafe 535",
    "sources": [
      "https://www.papago.com.cn/NewWebsite/html/download/CarDVR_GS535.php",
      "https://www.papago.com.cn/NewWebsite/html/manual/CarDVR_GS535.php"
    ],
    "provenance": "official-manual",
    "scope": "China mainland (official download/product catalogue); native global identities included",
    "evidence": "Official full model-specific user manual specifications explicitly state 镜头数量 | 单镜头 (lens count: single lens). Installation and connectors cover single recorder plus video output, not rear-camera input.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Rexing",
    "model": "F10",
    "sources": [
      "https://www.rexingusa.com/wp-content/uploads/2021/08/F10-UM.pdf",
      "https://www.rexingusa.com/pages/f10-product-support"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual complete Camera Overview/Parts lists one front lens, card slot and USB power/data; no supported secondary-camera input or multi-stream recording; product specifications enumerate one camera.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Rexing",
    "model": "V1 4K",
    "aliases": [
      "V1",
      "V1-4K"
    ],
    "sources": [
      "https://www.rexingusa.com/wp-content/uploads/2024/02/07252023-V1-4K.pdf",
      "https://www.rexingusa.com/pages/v1-product-support"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact official manual explicitly labels the rear-camera port NOT SUPPORTED (V1 family); remaining supported recording system is one front camera.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Rexing",
    "model": "V1 Basic",
    "sources": [
      "https://www.rexingusa.com/wp-content/uploads/2024/02/V1-Basic-07252023.pdf",
      "https://www.rexingusa.com/pages/v1-basic-product-support"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact official manual explicitly labels the rear-camera port NOT SUPPORTED (V1 family); remaining supported recording system is one front camera.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Rexing",
    "model": "V1 FHD",
    "sources": [
      "https://www.rexingusa.com/wp-content/uploads/2025/03/V1-FHD-11042023-UM.pdf",
      "https://www.rexingusa.com/pages/v1-fhd-product-support"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact official manual explicitly labels the rear-camera port NOT SUPPORTED (V1 family); remaining supported recording system is one front camera.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Rexing",
    "model": "V1 Gen 3",
    "sources": [
      "https://www.rexingusa.com/Download/manuals/Rexing%20V1%20Gen%203%20Operating%20Manual.pdf",
      "https://www.rexingusa.com/pages/v1-3rd-gen-product-support"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact official manual explicitly labels the rear-camera port NOT SUPPORTED (V1 family); remaining supported recording system is one front camera. gger Port 6. Micro SD Card Slot 7. Power 13. Rear Camera* Port *Not supported by V1 3rd Generation PAGE 17 Camera Overview 17 © 2018 REXING All R",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Rexing",
    "model": "V1 Lite",
    "sources": [
      "https://www.rexingusa.com/wp-content/uploads/2025/10/06252025-V1-Lite-UM.pdf",
      "https://www.rexingusa.com/pages/v1-lite-product-support"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual complete Camera Overview/Parts lists one front lens, card slot and USB power/data; no supported secondary-camera input or multi-stream recording; product specifications enumerate one camera.",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Rexing",
    "model": "V1 Max",
    "sources": [
      "https://www.rexingusa.com/wp-content/uploads/2022/05/V1-Max-QSG-05022022.pdf",
      "https://www.rexingusa.com/pages/v1-max-product-support"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Exact official manual explicitly labels the rear-camera port NOT SUPPORTED (V1 family); remaining supported recording system is one front camera. Slot 7. Reset Button 8. USB Charging Port 9. Rear Camera Port (Not Support ) 10. GPS Logger Port (Built-in GPS Logger) *The camera is recording",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Roav",
    "model": "C2",
    "aliases": [
      "R2210"
    ],
    "sources": [
      "https://goroav.com/pages/downloads",
      "https://lp.ankerjapan.com/hubfs/aoos/manual/R2210Manual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official Anker Japan manufacturer manual product overview enumerates one camera lens and micro-USB charging port; one-camera installation and one 145-degree camera lens specification, with no rear-camera input.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Rove",
    "model": "R2-4K",
    "sources": [
      "https://www.rovedashcam.com/products/rove-r2-4k-car-dashcam",
      "https://www.rovedashcam.com/collections/single-channel"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manufacturer single-channel collection identifies this as a dedicated one-camera model, separate from R2-4K Dual/Dual Pro; product architecture lists one front sensor/lens and power/data USB only. R2-4K Pro additionally owner-confirmed, but classification here is grounded in official catalog/product source.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Rove",
    "model": "R2-4K Pro",
    "sources": [
      "https://www.rovedashcam.com/products/new-rove-r2-4k-pro-dash-cam-4k-ultra-hd-2160p-dash-board-camera-built-in-wifi-gps",
      "https://www.rovedashcam.com/collections/single-channel"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manufacturer single-channel collection identifies this as a dedicated one-camera model, separate from R2-4K Dual/Dual Pro; product architecture lists one front sensor/lens and power/data USB only. R2-4K Pro additionally owner-confirmed, but classification here is grounded in official catalog/product source.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "SpyTec",
    "model": "G1W-C",
    "aliases": [
      "SpyTec G1W-C"
    ],
    "sources": [
      "https://dashcamtalk.com/cams/g1w/",
      "https://dashcamtalk.com/g1w/",
      "https://images-na.ssl-images-amazon.com/images/I/81aLur4E+tS.pdf"
    ],
    "provenance": "manufacturer-manual-mirror",
    "scope": "Documented SpyTec hardware only; not generic G1W/OEM clones.",
    "evidence": "SpyTec-authored manual mirrored on Amazon: one fixed-focus 120-degree lens, USB/HDMI/AV output/microSD interfaces, no rear input. Applies specifically to documented SpyTec G1W-C, not every OEM clone.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Street Guardian",
    "model": "SG9665GC",
    "sources": [
      "https://streetguardian.cam/",
      "https://streetguardian.cam/compare-cameras",
      "https://streetguardian.info/product-category/digital-video-recorders/dash-cams/"
    ],
    "provenance": "official-product-support",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official regional catalogue explicitly identifies SG9665GC as 1 Channel Full HD; distinct from expansion-capable SGGCX2PRO family. No claim propagated to similarly named models.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Street Guardian",
    "model": "SG9665TC",
    "sources": [
      "https://streetguardian.cam/compare-cameras"
    ],
    "provenance": "official-product-support",
    "scope": "global/unspecified; see brand status",
    "evidence": "Official comparison Channels row: One (no optional second camera indicated for this model).",
    "lifecycle": "unclear"
  },
  {
    "manufacturer": "Thinkware",
    "model": "F50",
    "sources": [
      "https://download2.inavi.com/dashcam/F50/manual/f50_manual_english_20180104.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual complete part names and installation enumerate the front main unit, DC power, card slot and external GPS input; no rear-camera/V-IN connector or second camera. Specifications list only one CMOS camera.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Thinkware",
    "model": "F70",
    "sources": [
      "https://download2.inavi.com/dashcam/F70/manual/f70_manual_english_20180424.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official F70 manual Part names (PDF pages 9–10) lists DC-IN, external GPS, front lens and memory-card slot; no V-IN/rear-camera connector. Specifications and installation are for one front camera.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Thinkware",
    "model": "F70 PRO",
    "sources": [
      "https://download2.inavi.com/dashcam/F70PRO/manual/f70pro_manual_english_20230824.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual complete part names and installation enumerate the front main unit, DC power, card slot and external GPS input; no rear-camera/V-IN connector or second camera. Specifications list only one CMOS camera.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Vantrue",
    "model": "E1",
    "aliases": [
      "Element 1"
    ],
    "sources": [
      "https://www.vantrue.com/products/vantrue-e1",
      "https://vantrue-app.vantruecam.com/files/manuals/e1/Vantrue E1 User Manual English.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual Camera Overview and specifications enumerate one front lens, power/data port, mount interface and card slot; no secondary-camera input or installation. E1 Pro power/data port is explicitly data transmission or LTE signal input, not camera expansion.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Vantrue",
    "model": "E1 Lite",
    "aliases": [
      "Element 1 Lite"
    ],
    "sources": [
      "https://www.vantrue.com/products/vantrue-e1-lite",
      "https://vantrue-app.vantruecam.com/files/manuals/e1lite/Vantrue E1 Lite User Manual English.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual Camera Overview and specifications enumerate one front lens, power/data port, mount interface and card slot; no secondary-camera input or installation. E1 Pro power/data port is explicitly data transmission or LTE signal input, not camera expansion.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Vantrue",
    "model": "E1 Pro",
    "aliases": [
      "Element 1 Pro"
    ],
    "sources": [
      "https://www.vantrue.com/products/element-1-pro",
      "https://vantrue-app.vantruecam.com/files/manuals/e1pro/Vantrue E1 Pro User Manual English.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual Camera Overview and specifications enumerate one front lens, power/data port, mount interface and card slot; no secondary-camera input or installation. E1 Pro power/data port is explicitly data transmission or LTE signal input, not camera expansion.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Vantrue",
    "model": "E1 Pro S",
    "aliases": [
      "E1ProS",
      "Element 1 Pro S"
    ],
    "sources": [
      "https://www.vantrue.com/products/element-1-pro-s-4k-dashcam",
      "https://www.vantrue.com/collections/only-front-dashcam"
    ],
    "provenance": "official-product-support",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manufacturer places the Element 1 Pro S in Only Front Dash Cam collection; dedicated product page describes its single 4K front imaging system. Product page says Pre-order, estimated shipping November 15th–20th; no rear/additional camera option described. This is product-level evidence, not extrapolation from S1 1CH bundles.",
    "lifecycle": "prerelease"
  },
  {
    "manufacturer": "Viofo",
    "model": "A119 Mini",
    "sources": [
      "https://cdn.shopify.com/s/files/1/0569/8905/7087/files/A119_Mini_English_Manual.pdf?v=1718098071"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual product diagram enumerates a single lens, memory-card slot and power/data/GPS interfaces, with no secondary-camera input or installation. The camera records one stream.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Viofo",
    "model": "A119 Mini 2",
    "sources": [
      "https://www.viofo.com/products/viofo-a119-mini-2-voice-control-2k-60fps-5ghz-wifi-dash-camera-with-sony-starvis-2-image-sensor-hdr-super-night-sensibility",
      "https://viofotech.com/download/manual/MINI2/A119MINI2EnglishManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual product diagram enumerates a single lens, memory-card slot and power/data/GPS interfaces, with no secondary-camera input or installation. The camera records one stream. Product FAQ explicitly says no rear/additional camera expansion.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Viofo",
    "model": "A119 v3",
    "sources": [
      "https://www.viofo.com/products/a119-v3-with-gps-2k-25601600p-30fps-quad-hd-car-dash-cam",
      "https://viofotech.com/download/manual/A119V3/A119V3EnglishManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual product diagram enumerates a single lens, memory-card slot and power/data/GPS interfaces, with no secondary-camera input or installation. The camera records one stream.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Viofo",
    "model": "A119M Pro",
    "sources": [
      "https://www.viofo.com/products/viofo-a119m-pro-4k-hdr-voice-control-dash-camera-with-sony-starvis-2-sensor",
      "https://viofotech.com/download/manual/A119MPRO/A119MProEnglishManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual product diagram enumerates a single lens, memory-card slot and power/data/GPS interfaces, with no secondary-camera input or installation. The camera records one stream. Product FAQ explicitly says no rear/additional camera expansion.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Viofo",
    "model": "A119S",
    "aliases": [
      "A119S V2",
      "A119SV2"
    ],
    "sources": [
      "https://support.viofo.com/helpdesk/attachments/19018909256"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual Interface/Product Diagram describes one lens, power/data USB, memory-card slot and (A119S) AV output/GPS, without a camera-input connector or secondary recording stream.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Viofo",
    "model": "VS1",
    "sources": [
      "https://www.viofo.com/products/viofo-vs1-mini-2k-hdr-with-sony-starvis-2-imx675-sensor-5ghz-wi-fi-voice-control-gps-dash-cam-with-free-32gb-microsd-card",
      "https://viofotech.com/download/manual/VS1/VS1EnglishManual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual product diagram enumerates a single lens, memory-card slot and power/data/GPS interfaces, with no secondary-camera input or installation. The camera records one stream.",
    "lifecycle": "current"
  },
  {
    "manufacturer": "Viofo",
    "model": "WM1",
    "sources": [
      "https://www.viofotech.com/download/manual/WM1/WM1%20English%20manual.pdf"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual product diagram enumerates a single lens, memory-card slot and power/data/GPS interfaces, with no secondary-camera input or installation. The camera records one stream.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Viofo",
    "model": "WR1",
    "sources": [
      "https://support.viofo.com/helpdesk/attachments/19017348869"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official manual Interface/Product Diagram describes one lens, power/data USB, memory-card slot and (A119S) AV output/GPS, without a camera-input connector or secondary recording stream.",
    "lifecycle": "legacy"
  },
  {
    "manufacturer": "Wolfbox",
    "model": "i03",
    "sources": [
      "https://cdn.shopify.com/s/files/1/0722/1077/6353/files/I03-User-Manuel.pdf",
      "https://wolfbox.com/pages/manual"
    ],
    "provenance": "official-manual",
    "scope": "Exact documented model; regional/historical completeness not established.",
    "evidence": "Official i03 manual specifications identify only Front Cam; complete Appearance list (manual p.9 / PDF page 11) enumerates lens, Micro SD slot and Mini USB, without AV-IN/rear-camera input. One independent forward recording stream.",
    "lifecycle": "legacy"
  }
];
