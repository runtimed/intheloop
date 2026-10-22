/// <reference types="vite/client" />

import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre 6 ships its worker separately. Bundle it and resolve it relative to
// these static assets so the preview can be copied into a host application's iframe.
setWorkerUrl(workerUrl);
