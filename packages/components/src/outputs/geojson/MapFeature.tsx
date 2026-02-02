import "maplibre-gl/dist/maplibre-gl.css";
import { RLayer, RMarker, RSource } from "maplibre-react-components";
import { useId } from "react";

const featureColor = "#ff000099";

const styles = {
  markerScale: 0.6,
  markerColor: featureColor,
  lineColor: featureColor,
  fillColor: featureColor,
  lineWidth: 3,
  fillOpacity: 0.3,
  circleRadius: 6,
};

interface MapFeatureProps {
  feature: GeoJSON.Feature;
  index: number;
}

/**
 * MapFeature component renders a GeoJSON feature
 *
 * This component supports all GeoJSON geometry types as defined in RFC 7946:
 * - Point, MultiPoint
 * - LineString, MultiLineString
 * - Polygon, MultiPolygon
 * - GeometryCollection
 *
 * @param feature - The GeoJSON feature to render
 * @param index - Index for generating unique IDs
 */
export function MapFeature({ feature, index }: MapFeatureProps) {
  // Render the feature based on geometry type
  switch (feature.geometry.type) {
    case "Point":
      return <PointMapFeature data={feature} />;
    case "LineString":
      return <LineStringMapFeature data={feature} />;
    case "Polygon":
      return <PolygonMapFeature data={feature} />;
    case "MultiPoint":
      return <MultiPointMapFeature data={feature} />;
    case "MultiLineString":
      return <MultiLineStringMapFeature data={feature} />;
    case "MultiPolygon":
      return <MultiPolygonMapFeature data={feature} />;
    case "GeometryCollection":
      // For GeometryCollection, render each geometry individually
      return (
        <>
          {feature.geometry.geometries.map((geom, geomIndex) => (
            <MapFeature
              key={feature.id + "-" + geomIndex}
              feature={{
                ...feature,
                geometry: geom,
              }}
              index={index * 1000 + geomIndex}
            />
          ))}
        </>
      );
    default:
      return null;
  }
}

function PointMapFeature({ data }: { data: GeoJSON.Feature }) {
  if (data.geometry.type !== "Point") return null;

  return (
    <RMarker
      longitude={data.geometry.coordinates[0]}
      latitude={data.geometry.coordinates[1]}
      initialColor={styles.markerColor}
      initialScale={styles.markerScale}
    />
  );
}

function LineStringMapFeature({ data }: { data: GeoJSON.Feature }) {
  const id = useId();

  if (data.geometry.type !== "LineString") return null;

  return (
    <>
      <RSource id={id} type="geojson" data={data} />
      <RLayer
        id={id + "-line"}
        source={id}
        type="line"
        paint={{
          "line-color": styles.lineColor,
          "line-width": styles.lineWidth,
        }}
      />
    </>
  );
}

function MultiPointMapFeature({ data }: { data: GeoJSON.Feature }) {
  if (data.geometry.type !== "MultiPoint") return null;

  const coordinates = data.geometry.coordinates as number[][];

  return (
    <>
      {coordinates.map((coord, i) => (
        <RMarker
          key={i}
          longitude={coord[0]}
          latitude={coord[1]}
          initialColor={styles.markerColor}
          initialScale={styles.markerScale}
        />
      ))}
    </>
  );
}

function MultiLineStringMapFeature({ data }: { data: GeoJSON.Feature }) {
  const id = useId();

  if (data.geometry.type !== "MultiLineString") return null;

  return (
    <>
      <RSource id={id} type="geojson" data={data} />
      <RLayer
        id={id + "-line"}
        source={id}
        type="line"
        paint={{
          "line-color": styles.lineColor,
          "line-width": styles.lineWidth,
        }}
      />
    </>
  );
}

function MultiPolygonMapFeature({ data }: { data: GeoJSON.Feature }) {
  const id = useId();

  if (data.geometry.type !== "MultiPolygon") return null;

  return (
    <>
      <RSource id={id} type="geojson" data={data} />
      <RLayer
        id={id + "-line"}
        source={id}
        type="line"
        paint={{
          "line-color": styles.lineColor,
          "line-width": styles.lineWidth,
        }}
      />
      <RLayer
        id={id + "-fill"}
        source={id}
        type="fill"
        paint={{
          "fill-color": styles.fillColor,
          "fill-opacity": styles.fillOpacity,
          "fill-outline-color": styles.lineColor,
        }}
      />
    </>
  );
}

function PolygonMapFeature({ data }: { data: GeoJSON.Feature }) {
  const id = useId();

  if (data.geometry.type !== "Polygon") return null;

  return (
    <>
      <RSource id={id} type="geojson" data={data} />
      <RLayer
        id={id + "-line"}
        source={id}
        type="line"
        paint={{
          "line-color": styles.lineColor,
          "line-width": styles.lineWidth,
        }}
      />
      <RLayer
        id={id + "-fill"}
        source={id}
        type="fill"
        paint={{
          "fill-color": styles.fillColor,
          "fill-outline-color": styles.lineColor,
          "fill-opacity": styles.fillOpacity,
        }}
      />
    </>
  );
}
