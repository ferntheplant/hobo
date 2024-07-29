# Hoboken Commuter API Reverse Engineering

## The HOP

Some dude's incomplete unofficial API client for python [here](https://github.com/athuler/PassioGo)

Some dude's hacky GUI client [here](https://nihal-pinto.github.io/Passio-STAY/)

- Real time bus info found at [Passiogo](https://hoboken.passiogo.com/)
  - Built jQuery
  - shipped without minification for my pleasure
  - Useful stuff about the website implementation
    - global var `buses` holds info on each bus
    - bus objects have lat/long, bus name, and ids
    - exposes Firebase cloud messaging (FCM) keys for some kind of real-time comms with server
      - not working in my browser probably due to privacy settings
- IMPORTANT NUMBERS:
  - Hoboken system: 466
  - Hoboken routes:
    - 46857, 47234, 47235 (green hop), 47233
- Look at types and comments in `main.ts` to see what the raw API responses look like
- instead of ETA we compute estimated distance to next stop since it's easier

- TODO: handle cases when no HOP buses are active
  - probably just some validation checks for "empty" arrays right after hitting API
  - also handle `excludedRoutes` for drop-down menu below
- TODO: build basic frontend with pure HTML and CSS
  - default to showing info for Red Hop 12th st and Green hop Trader Joe's
  - include drop-down selector to pick different lines/stations
  - button to instantly swap from home view to PATH view
- TODO: see if I can reimplement `turf.distance` to make this 0 dependency
- TODO: move types to JSDoc to eliminate build step
  - probably a huge pain in the ass and bun is pretty easy??

## NJ Transit Bus 126

TODO
