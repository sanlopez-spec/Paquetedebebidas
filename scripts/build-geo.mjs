#!/usr/bin/env node
// Genera /public/geo/world.topojson, argentina.topojson, mendoza.topojson
// Ejecutar: node scripts/build-geo.mjs

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'public', 'geo');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// ── topojson-client (ESM) ──────────────────────────────────────────
import * as topojson from 'topojson-client';
import { geoArea } from 'd3-geo';
// world-atlas via CJS require (JSON)
const worldAtlas = require('world-atlas/countries-110m.json');
// mapshaper via CJS require
const mapshaper = require('mapshaper');

// ── Country mapping: ISO 3166-1 numeric → { key, name } ─────────
// key = matches api/cava.ts geo.mundo keys (Spanish, from Airtable)
const COUNTRY_DATA = {
  '032': { key: 'Argentina',     name: 'Argentina' },
  '724': { key: 'España',        name: 'España' },
  '250': { key: 'Francia',       name: 'Francia' },
  '380': { key: 'Italia',        name: 'Italia' },
  '840': { key: 'EEUU',          name: 'EEUU' },
  '152': { key: 'Chile',         name: 'Chile' },
  '036': { key: 'Australia',     name: 'Australia' },
  '554': { key: 'Nueva Zelanda', name: 'Nueva Zelanda' },
  '710': { key: 'Sudáfrica',     name: 'Sudáfrica' },
  '620': { key: 'Portugal',      name: 'Portugal' },
  '858': { key: 'Uruguay',       name: 'Uruguay' },
  '076': { key: 'Brasil',        name: 'Brasil' },
  '068': { key: 'Bolivia',       name: 'Bolivia' },
  '604': { key: 'Perú',          name: 'Perú' },
  '218': { key: 'Ecuador',       name: 'Ecuador' },
  '170': { key: 'Colombia',      name: 'Colombia' },
  '600': { key: 'Paraguay',      name: 'Paraguay' },
  '862': { key: 'Venezuela',     name: 'Venezuela' },
  '276': { key: 'Alemania',      name: 'Alemania' },
  '826': { key: 'Reino Unido',   name: 'Reino Unido' },
};

// Province mapping: TopoJSON uppercase (no tildes) → { key, name }
// key matches api/cava.ts AR_PROVS (no-accent variants)
const PROV_NORM = {
  'MENDOZA':        { key: 'Mendoza',             name: 'Mendoza' },
  'SALTA':          { key: 'Salta',               name: 'Salta' },
  'RIO NEGRO':      { key: 'Rio Negro',            name: 'Río Negro' },
  'CHUBUT':         { key: 'Chubut',              name: 'Chubut' },
  'CATAMARCA':      { key: 'Catamarca',           name: 'Catamarca' },
  'SAN JUAN':       { key: 'San Juan',            name: 'San Juan' },
  'LA RIOJA':       { key: 'La Rioja',            name: 'La Rioja' },
  'NEUQUEN':        { key: 'Neuquen',             name: 'Neuquén' },
  'BUENOS AIRES':   { key: 'Buenos Aires',        name: 'Buenos Aires' },
  'CORDOBA':        { key: 'Córdoba',             name: 'Córdoba' },
  'SANTA FE':       { key: 'Santa Fe',            name: 'Santa Fe' },
  'ENTRE RIOS':     { key: 'Entre Rios',          name: 'Entre Ríos' },
  'TUCUMAN':        { key: 'Tucumán',             name: 'Tucumán' },
  'CORRIENTES':     { key: 'Corrientes',          name: 'Corrientes' },
  'MISIONES':       { key: 'Misiones',            name: 'Misiones' },
  'JUJUY':          { key: 'Jujuy',               name: 'Jujuy' },
  'FORMOSA':        { key: 'Formosa',             name: 'Formosa' },
  'CHACO':          { key: 'Chaco',               name: 'Chaco' },
  'SANTIAGO DEL ESTERO': { key: 'Santiago del Estero', name: 'Santiago del Estero' },
  'SAN LUIS':       { key: 'San Luis',            name: 'San Luis' },
  'LA PAMPA':       { key: 'La Pampa',            name: 'La Pampa' },
  'SANTA CRUZ':     { key: 'Santa Cruz',          name: 'Santa Cruz' },
  'TIERRA DEL FUEGO': { key: 'Tierra del Fuego', name: 'Tierra del Fuego' },
};

function normProv(raw) {
  const up = (raw || '').toUpperCase()
    .replace(/Ü/g, 'U')  // Ü → U
    .replace(/[ÁÀÂ]/g, 'A').replace(/[ÉÈÊ]/g, 'E').replace(/[ÍÌÎ]/g, 'I')
    .replace(/[ÓÒÔ]/g, 'O').replace(/[ÚÙÛ]/g, 'U').replace(/Ñ/g, 'N')
    .trim();
  // Handle Tierra del Fuego long name
  if (up.startsWith('TIERRA DEL FUEGO')) return 'TIERRA DEL FUEGO';
  return up;
}

// Mendoza department → zone (all uppercase, no tildes, matches TopoJSON)
const DEPT_ZONE = {
  'TUPUNGATO':    'Valle de Uco',
  'TUNUYAN':      'Valle de Uco',
  'SAN CARLOS':   'Valle de Uco',
  'LUJAN DE CUYO':'Luján de Cuyo',
  'MAIPU':        'Maipú',
  'SAN RAFAEL':   'San Rafael',
};

// ── Ring-orientation fix for d3-geo ───────────────────────────────
// d3.geoPath needs CCW exterior rings. If geoArea > 2π the feature is inverted
// (mapshaper dissolve sometimes flips winding) → reverse all ring coords.
function rewindFeature(f) {
  if (!f.geometry) return f;
  const area = geoArea(f);
  if (area <= 2 * Math.PI) return f;
  function flipRings(geom) {
    if (geom.type === 'Polygon') {
      return { ...geom, coordinates: geom.coordinates.map(ring => [...ring].reverse()) };
    }
    if (geom.type === 'MultiPolygon') {
      return { ...geom, coordinates: geom.coordinates.map(poly => poly.map(ring => [...ring].reverse())) };
    }
    return geom;
  }
  return { ...f, geometry: flipRings(f.geometry) };
}

// ── Mapshaper helper (v0.6+ Promise API) ──────────────────────────
async function mapshaperSimplify(geojson, pct = 5) {
  const result = await mapshaper.applyCommands(
    `-i in.geojson -simplify ${pct}% keep-shapes -o out.geojson format=geojson`,
    { 'in.geojson': JSON.stringify(geojson) }
  );
  return JSON.parse(result['out.geojson']);
}

// ── Main (wrapped to avoid top-level await issues with mapshaper) ──
(async () => {

// ── 1. World map ───────────────────────────────────────────────────
console.log('Building world.topojson…');

const worldFeatures = topojson.feature(worldAtlas, worldAtlas.objects.countries).features
  .filter(f => f.id !== 10) // Remove Antarctica (ISO 010)
  .map(f => {
    const idStr = String(f.id).padStart(3, '0');
    const info = COUNTRY_DATA[idStr];
    return {
      type: 'Feature',
      id: f.id,
      properties: {
        key:  info?.key  ?? null,
        name: info?.name ?? null,
      },
      geometry: f.geometry,
    };
  });

const worldGeoJSON = { type: 'FeatureCollection', features: worldFeatures };
const worldSimplified = await mapshaperSimplify(worldGeoJSON, 15);
worldSimplified.features = worldSimplified.features.map(rewindFeature);
writeFileSync(join(OUT, 'world.geojson'), JSON.stringify(worldSimplified));
const worldKB = Math.round(JSON.stringify(worldSimplified).length / 1024);
console.log(`  world.geojson: ${worldKB}kB, ${worldSimplified.features.length} features`);

// ── 2. Argentina departments → provinces ──────────────────────────
// Simplify BEFORE dissolve for much smaller output
console.log('Fetching Argentina topology…');
const argResp = await fetch('https://raw.githubusercontent.com/mgaitan/departamentos_argentina/master/departamentos-argentina.topojson');
const argTopo = await argResp.json();

// Use mapshaper: simplify first, then dissolve by province, then rename
const argResult = await mapshaper.applyCommands(
  `-i arg.topojson -simplify 0.5% keep-shapes -dissolve provincia -rename-fields name=provincia -o out.geojson format=geojson`,
  { 'arg.topojson': JSON.stringify(argTopo) }
);
const argRaw = JSON.parse(argResult['out.geojson']);

// Post-process: normalize province keys and names
const argFeatures = argRaw.features.map(f => {
  const rawName = f.properties.name || '';
  const normKey = normProv(rawName);
  const info = PROV_NORM[normKey];
  if (info) {
    f.properties = { key: info.key, name: info.name };
  } else {
    // Fallback: title-case the normalized key
    const tc = normKey.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
    f.properties = { key: tc, name: tc };
  }
  return f;
});
const argGeoJSON = { type: 'FeatureCollection', features: argFeatures.map(rewindFeature) };
writeFileSync(join(OUT, 'argentina.geojson'), JSON.stringify(argGeoJSON));
const argKB = Math.round(JSON.stringify(argGeoJSON).length / 1024);
console.log(`  argentina.geojson: ${argKB}kB, ${argFeatures.length} provinces`);

// ── 3. Mendoza departments → zones ────────────────────────────────
console.log('Building mendoza.geojson…');

// Add zona field via -each, then dissolve by zona (keep all depts as context too)
// Build zone map JSON string for -each expression
const zoneMapStr = JSON.stringify(DEPT_ZONE);

// Process all Mendoza departments: include both zone and non-zone as context
const mendResult = await mapshaper.applyCommands(
  `-i arg.topojson -filter "provincia === 'MENDOZA'" -simplify 1% keep-shapes -o out.geojson format=geojson`,
  { 'arg.topojson': JSON.stringify(argTopo) }
);
const mendDepts = JSON.parse(mendResult['out.geojson']);

// Group departments by zone (or null for context)
const zoneGroups = new Map();
const contextFeatures = [];

for (const f of mendDepts.features) {
  const dept = (f.properties.departamento || '').toUpperCase().trim();
  const zone = DEPT_ZONE[dept];
  if (zone) {
    if (!zoneGroups.has(zone)) zoneGroups.set(zone, []);
    zoneGroups.get(zone).push(f);
  } else {
    const deptName = f.properties.departamento || '';
    f.properties = { key: null, name: deptName.charAt(0) + deptName.slice(1).toLowerCase() };
    contextFeatures.push(f);
  }
}

// Union each zone's department features using mapshaper
const zoneFeatures = [];
for (const [zone, zoneFeatList] of zoneGroups.entries()) {
  const fc = { type: 'FeatureCollection', features: zoneFeatList };
  const zoneRes = await mapshaper.applyCommands(
    `-i zone.geojson -dissolve -o out.geojson format=geojson`,
    { 'zone.geojson': JSON.stringify(fc) }
  );
  let zoneGeo;
  try { zoneGeo = JSON.parse(zoneRes['out.geojson']); } catch { console.warn(`  Bad GeoJSON for zone ${zone}`); continue; }
  if (zoneGeo.features && zoneGeo.features[0]) {
    zoneGeo.features[0].properties = { key: zone, name: zone };
    zoneFeatures.push(zoneGeo.features[0]);
  } else {
    // Fallback: union the features manually (no dissolve)
    const multi = { type: 'MultiPolygon', coordinates: [] };
    for (const f of zoneFeatList) {
      const g = f.geometry;
      if (g?.type === 'Polygon') multi.coordinates.push(g.coordinates);
      else if (g?.type === 'MultiPolygon') multi.coordinates.push(...g.coordinates);
    }
    zoneFeatures.push({ type: 'Feature', properties: { key: zone, name: zone }, geometry: multi });
    console.warn(`  Zone ${zone}: used fallback union`);
  }
}

const mendGeoJSON = { type: 'FeatureCollection', features: [...contextFeatures, ...zoneFeatures].map(rewindFeature) };
writeFileSync(join(OUT, 'mendoza.geojson'), JSON.stringify(mendGeoJSON));
const mendKB = Math.round(JSON.stringify(mendGeoJSON).length / 1024);
const totalKB = worldKB + argKB + mendKB;
console.log(`  mendoza.geojson: ${mendKB}kB, ${mendGeoJSON.features.length} features`);
console.log(`  Total: ${totalKB}kB`);
console.log('Done ✓');

})().catch(e => { console.error(e); process.exit(1); });
