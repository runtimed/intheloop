import {
  mapFitFeatures2,
  normalizeData,
  MapFeature,
  GeoJsonMapOutput,
} from "@runtimed/components";
import { bartTestData } from "./example-data/bart";
import {
  bicycleRental,
  freeBus,
  campus,
  lightRailStop,
} from "./example-data/campus";
import { geometryCollection } from "./example-data/geomtry-collection";
import { wikipediaTestData } from "./example-data/wikipdedia";
import { RMap } from "maplibre-react-components";

export const GeoJsonDemoPage = () => {
  return (
    <div className="prose w-full max-w-none p-4">
      <h1 className="text-3xl font-bold">GeoJSON Demo</h1>

      <h2 className="text-xl font-bold">RMap directly</h2>

      <div className="h-[70vh] w-full overflow-hidden">
        <h3 className="text-lg font-bold">
          Wikipedia Demo: Point, LineString, Polygon
        </h3>
        <WikipediaDemo />
      </div>
      <div className="h-[70vh] w-full overflow-hidden">
        <h3 className="text-lg font-bold">
          Geometry Collection: Point and LineString
        </h3>
        <GeometryCollectionDemo />
      </div>
      <div className="h-[70vh] w-full overflow-hidden">
        <h3 className="text-lg font-bold">
          Campus: Point, MultiPolygon, LineString
        </h3>
        <CampusDemo />
      </div>
      <div className="h-[70vh] w-full overflow-hidden">
        <h3 className="text-lg font-bold">
          Bart: Point, MultiLineString, Polygon
        </h3>
        <BartDemo />
      </div>

      <h2 className="text-xl font-bold">GeoJsonMapOutput</h2>

      <h3 className="text-lg font-bold">Example: No data</h3>
      <GeoJsonMapOutput data={{}} />

      <h3 className="text-lg font-bold">Example: MultiPoint</h3>
      <GeoJsonMapOutput
        data={{
          type: "MultiPoint",
          coordinates: [
            [-73.984, 40.748],
            [-73.985, 40.749],
            [-73.986, 40.75],
            [-73.987, 40.751],
          ],
        }}
      />

      <h3 className="text-lg font-bold">
        Bart: Point, MultiLineString, Polygon
      </h3>
      <GeoJsonMapOutput data={bartTestData} />

      <h3 className="text-lg font-bold">
        Bart: Point, MultiLineString, Polygon
      </h3>
      <GeoJsonMapOutput data={bartTestData} />

      <div className="my-4 bg-gray-300 p-4">
        <h3 className="text-lg font-bold">Point</h3>
        <GeoJsonMapOutput
          data={{
            type: "Point",
            coordinates: [-118.4563712, 34.0163116],
          }}
        />

        <h3 className="text-lg font-bold">Point inside Feature</h3>
        <GeoJsonMapOutput
          data={{
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [-118.4563712, 34.0163116],
            },
          }}
        />

        <h3 className="text-lg font-bold">
          Point inside Feature inside FeatureCollection
        </h3>
        <GeoJsonMapOutput
          data={{
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [-118.4563712, 34.0163116],
                },
              },
            ],
          }}
        />

        <h3 className="text-lg font-bold">180th Meridian</h3>
        <a
          href="https://github.com/mapbox/mapbox-gl-js/issues/3250"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://github.com/mapbox/mapbox-gl-js/issues/3250
        </a>
        <GeoJsonMapOutput
          data={{
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [179.664878, -16.407901],
                [-172.404544, -13.716485],
              ],
            },
          }}
        />
      </div>
    </div>
  );
};

function BartDemo() {
  const { bearing, center, zoom } = mapFitFeatures2(bartTestData, [600, 400]);

  return (
    <RMap
      mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      initialCenter={center}
      initialZoom={zoom}
      initialBearing={bearing}
      cooperativeGestures={true}
    >
      {bartTestData.features.map((feature, index) => (
        <MapFeature key={index} feature={feature} index={index} />
      ))}
    </RMap>
  );
}

function WikipediaDemo() {
  const { bearing, center, zoom } = mapFitFeatures2(
    wikipediaTestData,
    [600, 400]
  );

  return (
    <RMap
      mapStyle="https://tiles.openfreemap.org/styles/bright"
      initialCenter={center}
      initialZoom={zoom}
      initialBearing={bearing}
      cooperativeGestures={true}
    >
      {wikipediaTestData.features.map((feature, index) => (
        <MapFeature key={feature.id || index} feature={feature} index={index} />
      ))}
    </RMap>
  );
}

function CampusDemo() {
  const featuresCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [campus, ...lightRailStop.features, ...freeBus.features],
  };

  const { bearing, center, zoom } = mapFitFeatures2(
    featuresCollection,
    [600, 400]
  );

  return (
    <RMap
      mapStyle="https://tiles.openfreemap.org/styles/positron"
      initialCenter={center}
      initialZoom={zoom}
      initialBearing={bearing}
      cooperativeGestures={true}
    >
      <MapFeature feature={campus} index={0} />
      {lightRailStop.features.map((feature, index) => (
        <MapFeature key={feature.id || index} feature={feature} index={index} />
      ))}
      {bicycleRental.features.map((feature, index) => (
        <MapFeature key={index} feature={feature} index={index} />
      ))}
      {freeBus.features.map((feature, index) => (
        <MapFeature key={feature.id || index} feature={feature} index={index} />
      ))}
    </RMap>
  );
}

function GeometryCollectionDemo() {
  const normalizedData = normalizeData(geometryCollection);

  const { bearing, center, zoom } = mapFitFeatures2(normalizedData, [600, 400]);

  return (
    <RMap
      mapStyle="https://tiles.openfreemap.org/styles/liberty"
      cooperativeGestures={true}
      initialCenter={center}
      initialZoom={zoom}
      initialBearing={bearing}
    >
      <MapFeature feature={normalizedData.features[0]} index={0} />
    </RMap>
  );
}
