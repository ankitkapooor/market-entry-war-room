/**
 * Generates src/data/geo.json: the US state outlines and one projected point
 * per metro, both already in the same 975x610 Albers USA space.
 *
 * Projecting here rather than in the browser keeps the app free of any mapping
 * dependency: it only ever draws SVG paths and circles.
 *
 *   node scripts/build-geo.mjs ../data/app.db <gazetteer.txt>
 *
 * State geometry: us-atlas (Census cartographic boundaries, 1:10m).
 * Metro centroids: Census Gazetteer CBSA internal points.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";

const [dbPath, gazPath] = process.argv.slice(2);
if (!dbPath || !gazPath) {
  console.error("usage: node scripts/build-geo.mjs <app.db> <gazetteer.txt>");
  process.exit(1);
}

const topology = JSON.parse(
  readFileSync(new URL("../node_modules/us-atlas/states-10m.json", import.meta.url))
);

// The scale d3 uses for a 975x610 Albers USA frame.
const projection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const path = geoPath(projection);
const round = (d) => d.replace(/\d+\.\d+/g, (n) => (+n).toFixed(1));

const states = feature(topology, topology.objects.states).features;
const outline = round(path(mesh(topology, topology.objects.states, (a, b) => a === b)));
const borders = round(path(mesh(topology, topology.objects.states, (a, b) => a !== b)));

// Only project metros the database actually knows about.
const known = new Set(
  execFileSync("sqlite3", [dbPath, "select id from markets"], { encoding: "utf8" })
    .trim()
    .split("\n")
);

const metros = {};
for (const line of readFileSync(gazPath, "latin1").split("\n").slice(1)) {
  const cols = line.split("\t");
  if (cols.length < 10) continue;
  const id = cols[1].trim();
  if (!known.has(id)) continue;
  const point = projection([parseFloat(cols[9]), parseFloat(cols[8])]);
  if (point) metros[id] = [+point[0].toFixed(1), +point[1].toFixed(1)];
}

const missing = [...known].filter((id) => !(id in metros));
if (missing.length) console.warn(`no centroid for ${missing.length} market(s): ${missing.join(", ")}`);

mkdirSync(new URL("../src/data", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../src/data/geo.json", import.meta.url),
  JSON.stringify({ width: 975, height: 610, outline, borders, metros })
);
console.log(`geo.json: ${states.length} states, ${Object.keys(metros).length} metros`);
