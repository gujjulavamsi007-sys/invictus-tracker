# Maps service settings

The Map screen uses MapLibre for rendering and stores saved client locations in the app's existing local storage. It does not need a Google Maps API key.

The first build uses these public service defaults:

- Map tiles and style: OpenFreeMap Liberty
- Place search: Photon (OpenStreetMap data)
- Driving route preview: OSRM public demo service
- Turn-by-turn navigation: Google Maps URL opened by Android or the browser

The map, search, and route services are provided by third parties. They may be rate-limited or temporarily unavailable; the app reports errors instead of changing or guessing trip data. These public endpoints are suitable for trying the feature, but they are not guaranteed production infrastructure. For regular business use, configure endpoints whose provider terms cover the expected usage.

To change endpoints for the Android APK built by GitHub Actions, add optional **repository variables** under **Settings → Secrets and variables → Actions → Variables**:

- `VITE_MAP_STYLE_URL`
- `VITE_GEOCODER_URL`
- `VITE_ROUTING_URL`

Leave a variable empty to keep its public default. The style URL must be a MapLibre-compatible style, the geocoder must accept Photon-compatible `q`, `limit`, `lat`, and `lon` parameters and return GeoJSON features, and the routing service must implement the OSRM `/route/v1/driving/...` response format. These values are included in the installed app, so do not put private API keys in them.

The app displays the map style's own attribution control. The map provider receives requests for the visible map area. Place search is sent only after the user submits a search; results are not queried as the user types. Matching saved client locations are searched on the phone first. Saved client names, notes, and trip history stay on the phone unless the user includes them in an app backup. When there is no local match, the submitted search words are sent to the geocoder. The routing service receives the current and selected destination coordinates to calculate a route; Google Maps receives those coordinates only after the user taps Navigate.
