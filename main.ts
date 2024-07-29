import * as turf from "@turf/turf";

const DEBUG = false;
const DEVICE_ID = Math.floor(Math.random() * 10 ** 8).toString();
const BASE_URL = `https://passio3.com/www/mapGetData.php?wTransloc=1&deviceId=${DEVICE_ID}`;
const HOBOKEN_SYSTEM_ID = "466";

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
  latitude: number;
  longitude: number;
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
  // unsure what this means semantically
  userId: string; // systemId
  name: string;
  id: string;
  routeGroupid: string; // should match id above
};

type StopsResponse = {
  stops: { [K: string]: PassioStop }; // keyed by "ID<stopId>"
  routes: { [K: string]: PassioStopRoute }; // keyed by routeId
  routePoints: { [K: string]: PassioRoutePoint[] }; // keyed by routeId
  groupPoints: { [HOBOKEN_SYSTEM_ID]: { [K: string]: PassioGroupRoute } }; // keyed by routeId
  excludedRoutesID: string[];
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
  buses: { [K: string]: PassioBus[] };
  excludedRoutes: string[];
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
  return busesData;
}

type Point = ReturnType<typeof turf.point>;
type Node = Point;
type RouteId = string;
type BusId = string;
type StationId = string;
type GroupId = string;

type Route = {
  id: RouteId; // myid
  active: boolean;
  position: Point;
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
  position: Point;
  bearing: number;
};

type Station = {
  id: StationId;
  name: string;
  routeId: RouteId;
  index: number;
  position: Point;
  radius: number;
};

function parsePosition(lat: string, long: string): Point {
  return toPoint(parseFloat(lat), parseFloat(long));
}

function toPoint(lat: number, long: number): Point {
  return turf.point([lat, long]);
}

function parseRoutesAndStations(
  routeData: PassioRoute[],
  stopsData: StopsResponse
): { routes: { [K: RouteId]: Route }; stations: { [K: StationId]: Station } } {
  const stations: { [K: StationId]: Station } = {};
  const routes: { [K: RouteId]: Route } = {};
  routeData.forEach((rawRoute) => {
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
  };
}

function parseBuses(busesData: BusesResponse): { [K: BusId]: Bus } {
  const buses: { [K: BusId]: Bus } = {};
  Object.entries(busesData.buses).forEach(([busId, rawBuses]) => {
    if (rawBuses.length === 0) {
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

type StationsToNodes = {
  [K: RouteId]: {
    [K: StationId]: number;
  };
};

function mapStationsToNodes(routes: { [K: RouteId]: Route }): StationsToNodes {
  const stationsToNodes: StationsToNodes = {};
  Object.entries(routes).forEach(([routeId, route]) => {
    const stationsPerRouteToNode: { [K: StationId]: number } = {};
    route.path.forEach((station) => {
      const distancesToStation = route.nodes.map((node) =>
        turf.distance(station.position, node)
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
  stations: { [K: StationId]: Station }
): [number, number] {
  const currIdx = argMin(
    route.nodes.map((p) => turf.distance(bus.position, p))
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

    console.log("Curr Idx: ", currIdx);
    console.log("Curr Pos: ", route.nodes[currIdx].geometry.coordinates);
    console.log("Prev Station Name: ", stations[prevStation].name);
    console.log("Prev Station Idx: ", prevIdx);
    console.log("Next Station Name: ", stations[bestFitStation].name);
    console.log("Next Station Idx: ", stationsForRoute[bestFitStation]);
  }

  return [currIdx, stationsForRoute[bestFitStation]];
}

function getDistanceToNextStation(
  bus: Bus,
  route: Route,
  stationsToNodes: StationsToNodes,
  stations: { [K: StationId]: Station }
) {
  const [currIdx, nextStationIdx] = getNextStation(
    bus,
    route,
    stationsToNodes,
    stations
  );

  let totalDistance = 0;
  let curr = currIdx;
  while (curr !== nextStationIdx) {
    const nextIdx = curr + 1 >= route.nodes.length ? 0 : curr + 1;
    totalDistance += turf.distance(route.nodes[curr], route.nodes[nextIdx], {
      units: "meters",
    });
    curr = nextIdx;
  }
  return totalDistance;
}

async function main() {
  const routesData = await getRoutes();
  const stopsData = await getStops();
  const busesData = await getBuses();

  const { routes, stations } = parseRoutesAndStations(routesData, stopsData);
  const buses = parseBuses(busesData);
  const stationsToNodes = mapStationsToNodes(routes);

  const greenHop = buses["408282"];
  const distanceToNextStation = getDistanceToNextStation(
    greenHop,
    routes[greenHop.routeId],
    stationsToNodes,
    stations
  );
  console.log(toMiles(distanceToNextStation), "mi");
}

function toMiles(meters: number) {
  return meters * 0.000621371192;
}

if (DEBUG) {
  await main()
}
