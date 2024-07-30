// global ------------------------------------------------------------------------------------------

// TODO: set these via env variables with runtime validation
const SERVICE_NAME = "hobo";
const VERSION = "0.0.1";
const DEBUG = true;
const LOG_LEVEL = DEBUG ? "debug" : "info";
const PORT = 8080;
const HOSTNAME = "localhost";
const UNIT: Units = "miles";
const DEVICE_ID = Math.floor(Math.random() * 10 ** 8).toString(); // should I play nice and use a static device?
const BASE_URL = `https://passio3.com/www/mapGetData.php?wTransloc=1&deviceId=${DEVICE_ID}`;
const HOBOKEN_SYSTEM_ID = "466";

type HopRoute = "green" | "red" | "blue" | "senior" | "holiday";
const HopRouteIds: Record<HopRoute, RouteId> = <const>{
  green: "47235",
  red: "47234",
  blue: "47235",
  senior: "47233",
  holiday: "6012",
};
const HOP_ROUTES: HopRoute[] = Object.keys(HopRouteIds) as HopRoute[];

type LogLevel = "everything" | "debug" | "info" | "warn" | "error" | "fatal";
const LogPriorities: Record<LogLevel, number> = <const>{
  fatal: -1,
  error: 0,
  warn: 10,
  info: 20,
  debug: 100,
  everything: 1000,
};
Object.freeze(LogPriorities);
const GlobalPriority = LogPriorities[LOG_LEVEL];

function logger(level: LogLevel, message: string, rest?: any): void {
  const givenPriority = LogPriorities[level];
  if (givenPriority <= GlobalPriority) {
    console.log(
      `${new Date().toISOString()} [${SERVICE_NAME}-${VERSION}] ${level}: ${message}${
        !!rest ? " " + JSON.stringify(rest) : ""
      }`
    );
  }
}

// passio-api --------------------------------------------------------------------------------------

type PassioRoute = {
  name: string;
  userId: string; // systemId
  myid: string;
  outdated: "0" | "1";
  id: string; // some kind of id?
  distance: number;
  latitude: string;
  longitude: string;
  timezone: string;
  groupId: string;
  serviceTime: string;
  serviceTimeShort: string;
};

type PassioStop = {
  routeId: string;
  stopId: string;
  position: string; // index
  name: string;
  latitude: number; // number for some reason?
  longitude: number; // number for some reason?
  id: string;
  radius: number;
  routeName: string;
  routeGroupId: number;
};

type PassioStopRouteEntry = [
  string, // index
  string, // stopId
  number // remoteGroupId
];

type PassioStopRoute = [
  string, // name
  string, // color
  ...PassioStopRouteEntry[]
];

type PassioRoutePoint = {
  // represents a point on the route to draw
  lat: string;
  lng: string;
};

type PassioGroupRoute = {
  // unsure what this entire type means semantically
  userId: string; // systemId
  name: string;
  id: string;
  routeGroupid: string; // should match id above
};

type StopsResponse = {
  stops: Record<string, PassioStop>; // keyed by "ID<stopId>"
  routes: Record<string, PassioStopRoute>; // keyed by routeId
  routePoints: Record<string, PassioRoutePoint[]>; // keyed by routeId
  groupPoints: { [HOBOKEN_SYSTEM_ID]: Record<string, PassioGroupRoute> }; // keyed by routeId
  excludedRoutesID: number[];
};

type PassioBus = {
  deviceId: number;
  paxLoad: number;
  busId: number;
  userId: number; // systemId
  latitude: string;
  longitude: string;
  calculatedCourse: string; // compass bearing
  outOfService: "0" | "1";
  totalCap: number;
  busName: string; // OEM id
  routeId: string;
  route: string; // route name
  outdated: 0 | 1;
};

type BusesResponse = {
  buses: Record<string, PassioBus[]>;
  excludedRoutes: number[];
};

async function getRoutes() {
  const systemUrl = new URL(BASE_URL);
  systemUrl.searchParams.set("getRoutes", "1");
  const res = await fetch(systemUrl, {
    method: "POST",
    body: JSON.stringify({ systemSelected0: HOBOKEN_SYSTEM_ID, amount: 1 }),
    headers: { Accept: "*/*", "Content-Type": "application/json" },
  });

  // TODO: runtime validation
  const routesData = (await res.json()) as PassioRoute[];
  logger("everything", "Routes data: ", routesData);
  return routesData;
}

async function getStops() {
  const systemUrl = new URL(BASE_URL);
  systemUrl.searchParams.set("getStops", "1");
  const res = await fetch(systemUrl, {
    method: "POST",
    body: JSON.stringify({ s0: HOBOKEN_SYSTEM_ID, sA: 1 }),
    headers: { Accept: "*/*", "Content-Type": "application/json" },
  });

  // TODO: runtime validation
  const stopsData = (await res.json()) as StopsResponse;
  logger("everything", "Stops data: ", stopsData);
  return stopsData;
}

async function getBuses() {
  const systemUrl = new URL(BASE_URL);
  systemUrl.searchParams.set("getBuses", "1");
  const res = await fetch(systemUrl, {
    method: "POST",
    body: JSON.stringify({ s0: HOBOKEN_SYSTEM_ID, sA: 1 }),
    headers: { Accept: "*/*", "Content-Type": "application/json" },
  });

  // TODO: runtime validation
  const busesData = (await res.json()) as BusesResponse;
  logger("everything", "Buses data: ", busesData);
  return busesData;
}

// core --------------------------------------------------------------------------------------------

type Coord = [number, number];
type Node = Coord;
type RouteId = string;
type BusId = string;
type StationId = string;
type GroupId = string;

type Route = {
  id: RouteId; // myid
  name: string;
  active: boolean;
  position: Coord;
  distance: number;
  timezone: string;
  groupId: GroupId;
  message: string;
  path: Station[]; // ordered path bus takes on this route
  nodes: Node[];
};

type Bus = {
  id: BusId;
  name: string;
  routeId: RouteId;
  active: boolean;
  load: number;
  position: Coord;
  bearing: number;
};

type Station = {
  id: StationId;
  name: string;
  routeId: RouteId;
  index: number;
  position: Coord;
  radius: number;
};

function parsePosition(lat: string, long: string): Coord {
  return [parseFloat(lat), parseFloat(long)];
}

function parseRoutesAndStations(
  routeData: PassioRoute[],
  stopsData: StopsResponse
): {
  routes: Record<RouteId, Route>;
  stations: Record<StationId, Station>;
  excludedRoutes: RouteId[];
} {
  const stations: Record<StationId, Station> = {};
  const routes: Record<RouteId, Route> = {};
  const excludedRoutes = stopsData.excludedRoutesID.map(String);
  routeData.forEach((rawRoute) => {
    if (excludedRoutes.includes(rawRoute.myid)) {
      return;
    }
    const rawPath = stopsData.routes[rawRoute.myid].slice(2);
    const parsedPath: Station[] = rawPath.map((routeEntry) => {
      const stationId = routeEntry[1];
      const rawStop = stopsData.stops["ID" + stationId]; // keyed with ID prefix
      const station = {
        id: stationId,
        name: rawStop.name,
        routeId: rawStop.routeId,
        index: parseInt(rawStop.position),
        position: parsePosition(
          String(rawStop.latitude),
          String(rawStop.longitude)
        ),
        radius: rawStop.radius,
      };
      stations[stationId] = station;
      return station;
    });
    const rawNodes = stopsData.routePoints[rawRoute.myid];
    const nodes = rawNodes.map((node) => parsePosition(node.lat, node.lng));
    const route: Route = {
      id: rawRoute.myid,
      name: rawRoute.name,
      active: rawRoute.outdated === "1",
      position: parsePosition(rawRoute.latitude, rawRoute.longitude),
      distance: rawRoute.distance,
      timezone: rawRoute.timezone,
      groupId: rawRoute.groupId,
      message: rawRoute.serviceTime,
      path: parsedPath,
      nodes: nodes,
    };
    routes[rawRoute.myid] = route;
  });
  return {
    routes,
    stations,
    excludedRoutes,
  };
}

function parseBuses(
  busesData: BusesResponse,
  excludedRoutes: RouteId[]
): Record<BusId, Bus> {
  const buses: Record<BusId, Bus> = {};
  Object.entries(busesData.buses).forEach(([busId, rawBuses]) => {
    if (excludedRoutes.includes(busId) || rawBuses.length === 0) {
      return;
    }
    const rawBus = rawBuses[0];
    const bus: Bus = {
      id: busId,
      name: rawBus.busName,
      routeId: rawBus.routeId,
      active: rawBus.outdated === 1,
      load: parseFloat((rawBus.paxLoad / rawBus.totalCap).toFixed(2)),
      position: parsePosition(rawBus.latitude, rawBus.longitude),
      bearing: parseFloat(rawBus.calculatedCourse),
    };
    buses[bus.id] = bus;
  });
  return buses;
}

function min<T>(arr: T[]): T | null {
  if (arr.length === 0) {
    return null;
  }
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i];
    }
  }
  return min;
}

function argMin<T>(arr: T[]): number {
  if (arr.length === 0) {
    return -1;
  }
  let min = arr[0];
  let idx = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i];
      idx = i;
    }
  }
  return idx;
}

type StationsToNodes = Record<RouteId, Record<StationId, number>>;

function mapStationsToNodes(routes: Record<RouteId, Route>): StationsToNodes {
  const stationsToNodes: StationsToNodes = {};
  Object.entries(routes).forEach(([routeId, route]) => {
    const stationsPerRouteToNode: { [K: StationId]: number } = {};
    route.path.forEach((station) => {
      const distancesToStation = route.nodes.map((node) =>
        distance(station.position, node, { units: UNIT })
      );
      const bestNode = argMin(distancesToStation);
      stationsPerRouteToNode[station.id] = bestNode;
    });
    stationsToNodes[routeId] = stationsPerRouteToNode;
  });
  return stationsToNodes;
}

function getNextStation(
  bus: Bus,
  route: Route,
  stationsToNodes: StationsToNodes,
  stations: Record<StationId, Station>
) {
  const currIdx = argMin(
    route.nodes.map((p) => distance(bus.position, p, { units: UNIT }))
  );

  // TODO: this is a mess lmao
  const stationsForRoute = stationsToNodes[route.id];
  const stationIdxes = Object.values(stationsForRoute);
  const futureStations = stationIdxes.filter((idx) => idx > currIdx);
  const bestFitIdx = min(futureStations) || min(stationIdxes)!;
  const bestFitStation = Object.keys(stationsForRoute).find(
    (stationId) => stationsForRoute[stationId] === bestFitIdx
  )!;

  if (DEBUG) {
    const sortedStationIdxes = stationIdxes.sort();
    const idxOfBestFitIdx = sortedStationIdxes.findIndex(
      (v) => v === bestFitIdx
    );
    const idxOfPrevIdx =
      idxOfBestFitIdx - 1 >= 0 ? idxOfBestFitIdx - 1 : stationIdxes.length - 1;
    const prevIdx = sortedStationIdxes[idxOfPrevIdx];
    const prevStation = Object.keys(stationsForRoute).find(
      (stationId) => stationsForRoute[stationId] === prevIdx
    )!;

    logger("debug", "Curr Idx: ", currIdx);
    logger("debug", "Curr Pos: ", route.nodes[currIdx]);
    logger("debug", "Prev Station Name: ", stations[prevStation].name);
    logger("debug", "Prev Station Idx: ", prevIdx);
    logger("debug", "Next Station Name: ", stations[bestFitStation].name);
    logger("debug", "Next Station Idx: ", stationsForRoute[bestFitStation]);
  }

  return {
    currStationIdx: currIdx,
    nextStationIdx: bestFitIdx,
    nextStation: bestFitStation,
  };
}

function getDistanceToNextStation(
  currStationIdx: number,
  nextStationIdx: number,
  route: Route
) {
  let totalDistance = 0;
  let curr = currStationIdx;
  while (curr !== nextStationIdx) {
    const nextIdx = curr + 1 >= route.nodes.length ? 0 : curr + 1;
    totalDistance += distance(route.nodes[curr], route.nodes[nextIdx], {
      units: UNIT,
    });
    curr = nextIdx;
  }
  return totalDistance;
}

// geometry ----------------------------------------------------------------------------------------

// Taken from https://github.com/Turfjs/turf/
export function degreesToRadians(degrees: number): number {
  const radians = degrees % 360;
  return (radians * Math.PI) / 180;
}

type Units =
  | "meters"
  | "metres"
  | "millimeters"
  | "millimetres"
  | "centimeters"
  | "centimetres"
  | "kilometers"
  | "kilometres"
  | "miles"
  | "nauticalmiles"
  | "inches"
  | "yards"
  | "feet"
  | "radians"
  | "degrees";
const EARTH_RADIUS = 6371008.8;
const Factors: Record<Units, number> = {
  centimeters: EARTH_RADIUS * 100,
  centimetres: EARTH_RADIUS * 100,
  degrees: 360 / (2 * Math.PI),
  feet: EARTH_RADIUS * 3.28084,
  inches: EARTH_RADIUS * 39.37,
  kilometers: EARTH_RADIUS / 1000,
  kilometres: EARTH_RADIUS / 1000,
  meters: EARTH_RADIUS,
  metres: EARTH_RADIUS,
  miles: EARTH_RADIUS / 1609.344,
  millimeters: EARTH_RADIUS * 1000,
  millimetres: EARTH_RADIUS * 1000,
  nauticalmiles: EARTH_RADIUS / 1852,
  radians: 1,
  yards: EARTH_RADIUS * 1.0936,
};

export function radiansToLength(
  radians: number,
  units: Units = "kilometers"
): number {
  const factor = Factors[units];
  if (!factor) {
    throw new Error(units + " units is invalid");
  }
  return radians * factor;
}

function distance(
  from: Coord,
  to: Coord,
  options: {
    units?: Units;
  } = {}
) {
  const dLat = degreesToRadians(to[1] - from[1]);
  const dLon = degreesToRadians(to[0] - from[0]);
  const lat1 = degreesToRadians(from[1]);
  const lat2 = degreesToRadians(to[1]);

  const a =
    Math.pow(Math.sin(dLat / 2), 2) +
    Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);

  return radiansToLength(
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
    options.units
  );
}

// server ------------------------------------------------------------------------------------------

type RequestBody = {
  busName: HopRoute;
};

// TODO: cleaner, more extensible validation
function validateBody(body: unknown): RequestBody {
  if (body === null || typeof body !== "object") {
    throw new Error("Empty request body");
  }
  if (!Object.hasOwn(body, "busName")) {
    throw new Error("Request missing key 'busName'");
  }
  const providedBusName = (body as any)["busName"] as string;
  if (!(HOP_ROUTES as string[]).includes(providedBusName)) {
    throw new Error("Unknown bus route");
  }
  return {
    busName: providedBusName as HopRoute,
  };
}

async function handler(pathname: string, payload: unknown): Promise<Response> {
  const body = validateBody(payload);
  logger("debug", "Body:", body);
  if (pathname !== "/hop") {
    return new Response("404");
  }
  const res = await testHopDistance(HopRouteIds[body.busName]);
  return new Response(res);
}

const server = Bun.serve({
  port: PORT,
  hostname: HOSTNAME,
  async fetch(req) {
    logger("debug", "Processing request");
    const url = new URL(req.url);
    const body = await req.json();
    return await handler(url.pathname, body);
  },
  // TODO: correct status codes
  error(err) {
    return new Response(`400: ${err.message}`);
  },
});

logger("info", `Server running on ${server.hostname}:${server.port}`);

// testing -----------------------------------------------------------------------------------------

async function testHopDistance(routeId: string) {
  const routesData = await getRoutes();
  const stopsData = await getStops();
  const busesData = await getBuses();

  const { routes, stations, excludedRoutes } = parseRoutesAndStations(
    routesData,
    stopsData
  );
  const buses = parseBuses(busesData, excludedRoutes);
  const stationsToNodes = mapStationsToNodes(routes);

  const bus = Object.values(buses).find((bus) => bus.routeId === routeId);
  if (bus) {
    const { currStationIdx, nextStationIdx, nextStation } = getNextStation(
      bus,
      routes[bus.routeId],
      stationsToNodes,
      stations
    );
    const distanceToNextStation = getDistanceToNextStation(
      currStationIdx,
      nextStationIdx,
      routes[bus.routeId]
    );
    const rtn = `${distanceToNextStation.toFixed(3)} ${UNIT} to ${
      stations[nextStation].name
    }`;
    logger("debug", rtn);
    return rtn;
  } else {
    const rtn = "No bus data";
    logger("warn", rtn);
    return rtn;
  }
}

// await testHopDistance("408282");
