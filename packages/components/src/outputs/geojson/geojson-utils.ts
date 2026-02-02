// Taken from: https://github.com/mapbox/geojson-normalize/blob/4c6a3e3fd3cc54f658c7b262f5ec8b60a8239afa/index.js

import { mapFitFeatures } from "geojson-map-fit-mercator";

export const geoJsonTypes = {
  Point: "geometry",
  MultiPoint: "geometry",
  LineString: "geometry",
  MultiLineString: "geometry",
  Polygon: "geometry",
  MultiPolygon: "geometry",
  GeometryCollection: "geometry",
  //
  Feature: "feature",
  //
  FeatureCollection: "featureCollection",
} as const;

export function normalizeData(
  data: GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry
): GeoJSON.FeatureCollection {
  if (!data || !data.type) {
    throw new Error("Invalid data type");
  }

  const type = geoJsonTypes[data.type];

  if (!type) {
    throw new Error("Invalid data type");
  }

  switch (type) {
    case "featureCollection":
      return data as GeoJSON.FeatureCollection;
    case "geometry":
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: data as GeoJSON.Geometry,
          },
        ],
      };
    case "feature":
      return {
        type: "FeatureCollection",
        features: [data as GeoJSON.Feature],
      };
    default:
      throw new Error("Invalid data type");
  }
}

export type MapFitFeaturesResult = ReturnType<typeof mapFitFeatures>;
export type MapFitFeaturesOptions = Parameters<typeof mapFitFeatures>[2];

const DEFAULT_POINT_ZOOM = 15;

const noZoomResult = {
  bearing: 0,
  center: [0, 0],
  zoom: 1,
} as const satisfies MapFitFeaturesResult;

/**
 * The same as `mapFitFeatures`, but with a few extra features:
 * - Show whole world if no features
 * - Zoom into single point if only one feature
 * - Zoom into features if more than one feature
 * @param data GeoJSON.FeatureCollection
 * @param size [number, number]
 * @param options {
 *   padding?: number;
 * }
 * @returns  MapFitFeaturesResult
 */
export function mapFitFeatures2(
  data: GeoJSON.FeatureCollection,
  size: [number, number],
  options?: MapFitFeaturesOptions
): MapFitFeaturesResult {
  try {
    // Show whole world if no features
    if (data.features.length === 0) {
      return noZoomResult;
    }

    // Zoom into single point if only one feature
    // TODO: if only a single point, we don't have a good way to determine the right zoom level
    // Sometimes users will want to zoom in, others will want to see the entire map
    if (
      data.features.length === 1 &&
      data.features[0].type === "Feature" &&
      data.features[0].geometry.type === "Point"
    ) {
      return {
        bearing: 0,
        center: [
          data.features[0].geometry.coordinates[0],
          data.features[0].geometry.coordinates[1],
        ],
        zoom: DEFAULT_POINT_ZOOM,
      } as const satisfies MapFitFeaturesResult;
    }

    // Zoom into features if more than one feature
    return mapFitFeatures(data, size, options);
  } catch (error) {
    // Fallback to no zoom if there's an error
    console.error("Error fitting features", error);
    return noZoomResult;
  }
}
