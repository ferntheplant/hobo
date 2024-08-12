# Hoboken Commuter API Reverse Engineering

## The HOP

- Other examples of GUIs/API clients for passiogo
  - [College](https://nihal-pinto.github.io/Passio-STAY/)
  - [Python](https://github.com/athuler/PassioGo)
- Real time bus info found at [Passiogo](https://hoboken.passiogo.com/)
  - Built jQuery
  - shipped without minification
  - Useful stuff about the website implementation
    - global var `buses` holds info on each bus
    - bus objects have lat/long, bus name, and IDs
    - exposes Firebase cloud messaging (FCM) keys for some kind of real-time comms with server
      - not working in my browser due to privacy settings
- IMPORTANT NUMBERS:
  - Hoboken system: 466
  - Hoboken routes:
    - 46857, 47234, 47235 (green hop), 47233
- Look at types and comments in `main.ts:passio-api` to see what the raw API responses look like
- instead of ETA we compute estimated distance to next stop since it's easier

- TODO: build basic frontend with pure HTML and CSS
  - default to showing info for Red Hop 12th st and Green hop Trader Joe's
  - include drop-down selector to pick different lines/stations
- TODO: build up histogram to provide ETAs
  - Architecture: every time we check in record the current time, route, and bus location
  - SOLUTION 1: periodically compute time deltas + distance traveled during those deltas
    - compute as total distance traveled from previous node to current node
    - save as map from distance to list of time deltas
    - what happens then the bus goes way off course due to missed turns or road closures?
  - SOLUTION 2: check in often enough to capture many instances of bus being near a station (<0.25mi?)
    - Record all time deltas between adjacent keyed by time of day and day of week
    - any time we check in look up saved time to next stop to show ETA
- TODO: move types to JSDoc to eliminate build step
  - probably a huge lift and `bun build` is simple enough for now
  - split up into modules as described by comments once single file becomes unmanageable

## NJ Transit Bus 126

- button to instantly swap from home view to PATH view
- connection opportunities with MTA
