# Third-party software and map data

The repository's original code is MIT licensed. Dependencies and external data
retain their own licenses; the root LICENSE does not relicense them.

## Browser dependencies

| Package | License | Upstream |
| --- | --- | --- |
| React / React DOM | MIT | https://github.com/facebook/react |
| Leaflet | BSD-2-Clause | https://github.com/Leaflet/Leaflet |
| leaflet.markercluster | MIT | https://github.com/Leaflet/Leaflet.markercluster |
| @tmcw/togeojson | BSD-2-Clause | https://github.com/placemark/togeojson |
| Dexie | Apache-2.0 | https://github.com/dexie/Dexie.js |
| Zustand | MIT | https://github.com/pmndrs/zustand |

Exact dependency versions are in `package-lock.json`. Preserve the applicable
copyright notices and license texts when distributing dependencies or bundles.
The map lifecycle integration in `TicketMap.tsx` is app-owned code using Leaflet
directly; this release does not depend on or redistribute React Leaflet.

## Optional scanning tools

Linux scanning uses separately installed OpenCV (Apache-2.0 for current 4.x),
Tesseract (Apache-2.0), Pillow (HPND) and NumPy (BSD-3-Clause). Their distributions
may include further notices for bundled components. See their installed license
files and upstream repositories: [OpenCV](https://github.com/opencv/opencv),
[Tesseract](https://github.com/tesseract-ocr/tesseract),
[Pillow](https://github.com/python-pillow/Pillow),
[NumPy](https://github.com/numpy/numpy).

macOS scanning calls Apple's system Vision, CoreImage and ImageIO frameworks.
These proprietary system frameworks are not included or relicensed here.

## OpenStreetMap

Map data is © OpenStreetMap contributors, under the
[Open Database License](https://www.openstreetmap.org/copyright).
The default basemap requests OpenStreetMap tiles; its
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/) applies.
Do not remove visible attribution or use the public tile service for bulk downloads.

The optional railway importer accepts the
[HOT/HDX China railway export](https://data.humdata.org/dataset/hotosm_chn_railways).
No railway dataset, location history, route cache or personal ticket is included
in this source release. If you publish derived map databases, review the data
license obligations separately from the MIT software license.

Development tools also retain their respective licenses. This document identifies
major components; it does not replace upstream license texts or a full distribution
license inventory.
