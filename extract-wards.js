const fs = require('fs');
const path = require('path');

const workspaceDir = __dirname;
const sourcePath = path.join(workspaceDir, 'dataraw.json');
const combinedOutputPath = path.join(workspaceDir, 'all-wards.geojson');

function slugifyWardName(name) {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function webMercatorToWgs84(point) {
  const [x, y] = point;
  const radius = 6378137;
  const lon = (x / radius) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

function convertRing(ring) {
  return ring.map(webMercatorToWgs84);
}

function convertGeometry(geometry) {
  const rings = geometry?.rings;

  if (!Array.isArray(rings) || rings.length === 0) {
    throw new Error('Feature geometry is missing polygon rings');
  }

  return {
    type: 'Polygon',
    coordinates: rings.map(convertRing),
  };
}

function buildFeature(feature) {
  const attributes = feature.attributes || {};

  return {
    type: 'Feature',
    properties: {
      WardName: attributes.WardName,
      NoCllrs: attributes.NoCllrs,
      Number: attributes.Number,
    },
    geometry: convertGeometry(feature.geometry),
  };
}

function buildFeatureCollection(feature) {
  return {
    type: 'FeatureCollection',
    features: [feature],
  };
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const finalLayer = source.operationalLayers.find((layer) => layer.title === 'Final Recommendations');

if (!finalLayer?.featureCollection?.layers?.[0]?.featureSet?.features) {
  throw new Error('Final Recommendations feature collection was not found in dataraw.json');
}

const sourceFeatures = finalLayer.featureCollection.layers[0].featureSet.features;
const convertedFeatures = sourceFeatures.map(buildFeature);

let createdFiles = 0;
for (const feature of convertedFeatures) {
  const wardName = feature.properties.WardName;
  const fileName = `${slugifyWardName(wardName)}.geojson`;
  const outputPath = path.join(workspaceDir, fileName);

  if (fileName === 'netherton-newsome.geojson' && fs.existsSync(outputPath)) {
    continue;
  }

  const output = JSON.stringify(buildFeatureCollection(feature), null, 2);
  fs.writeFileSync(outputPath, `${output}\n`);
  createdFiles += 1;
}

const combinedOutput = {
  type: 'FeatureCollection',
  features: convertedFeatures,
};

fs.writeFileSync(combinedOutputPath, `${JSON.stringify(combinedOutput, null, 2)}\n`);

console.log(`Created ${createdFiles} single-ward GeoJSON files.`);
console.log(`Created combined file: ${path.basename(combinedOutputPath)}`);