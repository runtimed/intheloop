import "maplibre-gl/dist/maplibre-gl.css";
import {
  RFullscreenControl,
  RMap,
  RNavigationControl,
  RSource,
} from "maplibre-react-components";
import { useId, useMemo } from "react";
import { useMeasure } from "react-use";
import { mapFitFeatures2, normalizeData } from "./geojson-utils.js";
import { MapFeature } from "./MapFeature.js";

interface GeoJsonMapProps {
  data: unknown;
}

export function GeoJsonMapOutput({ data }: GeoJsonMapProps) {
  const [ref, { width, height }] = useMeasure<HTMLDivElement>();

  const isReady = width && height;

  return (
    <div
      ref={ref}
      // Min height to fit all the controls
      className="h-[45vw] min-h-[200px] w-full overflow-hidden rounded-md border border-gray-200"
    >
      {isReady ? (
        <ActualMap data={data as any} width={width} height={height} />
      ) : null}
    </div>
  );
}

function ActualMap({
  data,
  width,
  height,
}: {
  data: GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry;
  width: number;
  height: number;
}) {
  const sourceId = useId();

  const normalizedData = useMemo(() => {
    try {
      return normalizeData(data);
    } catch (error) {
      console.error("Error normalizing data", error);
      return {
        type: "FeatureCollection",
        features: [],
      } as GeoJSON.FeatureCollection;
    }
  }, [data]);

  const { bearing, center, zoom } = useMemo(() => {
    const padding = 50; // in pixels

    return mapFitFeatures2(normalizedData, [width, height], {
      padding: {
        left: padding,
        right: padding,
        top: padding,
        bottom: padding,
      },
    });
  }, [normalizedData, width, height]);

  return (
    <RMap
      key="map"
      // Using this one because it has a nice balance of details
      // - Not too many details like the "bright" one
      // - "positron" uses neutral colors, making it hard to make out features, but can be great for overlays
      mapStyle="https://tiles.openfreemap.org/styles/bright"
      initialCenter={center}
      initialZoom={zoom}
      initialBearing={bearing}
      cooperativeGestures={true}
    >
      <RFullscreenControl />
      <RNavigationControl position="top-right" visualizePitch={true} />
      <RSource key="data" id={sourceId} type="geojson" data={normalizedData} />
      {normalizedData.features.map((feature, index) => (
        <MapFeature key={feature.id || index} feature={feature} index={index} />
      ))}
    </RMap>
  );
}
