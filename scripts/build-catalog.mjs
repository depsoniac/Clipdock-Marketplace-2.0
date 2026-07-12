#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ClipDock Marketplace - Robot de catalogo
// ---------------------------------------------------------------------------
// Escanea plugins/<carpeta>/plugin.json (fuente estatico), resuelve el ULTIMO
// release de GitHub de cada plugin (version, asset, sha256, tamano) y genera:
//   - catalog-resolved.json  -> lo que la app ClipDock lee primero (1 fetch)
//   - plugins/index.json     -> indice de carpetas (autogenerado)
//
// Reglas:
//   - Un plugin con "enabled": false se OMITE del catalogo.
//   - No se editan los plugin.json fuente: todo lo volatil se deriva aqui.
//   - Si un plugin no tiene release usable, igual se incluye marcado como
//     "no disponible" para que la tienda lo muestre como "pendiente".
//
// Uso:  node scripts/build-catalog.mjs
// Env:  GITHUB_TOKEN (opcional, sube el limite de la API de 60 a 5000/h)
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const CONFIG_FILE = path.join(ROOT, 'catalog.json');
const RESOLVED_FILE = path.join(ROOT, 'catalog-resolved.json');
const INDEX_FILE = path.join(PLUGINS_DIR, 'index.json');

const RAW_BASE = 'https://raw.githubusercontent.com/depsoniac/Clipdock-Marketplace-2.0/main/plugins';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const log = (...a) => console.log('[build-catalog]', ...a);
const warn = (...a) => console.warn('[build-catalog] WARN', ...a);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); // quita BOM
  return JSON.parse(raw);
}

function wildcardToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function parseRepository(plugin) {
  const r = plugin.repository;
  if (r && r.owner && r.repo) return { owner: String(r.owner), repo: String(r.repo) };
  const url = String(plugin.repo || (plugin.links && plugin.links.release) || '');
  const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  return null;
}

async function githubApi(url) {
  const headers = { 'User-Agent': 'clipdock-marketplace-bot', 'Accept': 'application/vnd.github+json' };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`GitHub API ${res.status} en ${url}`);
  return res.json();
}

async function sha256AndSizeOf(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'clipdock-marketplace-bot' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`No se pudo bajar el asset (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { sha256: crypto.createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length };
}

function formatByteSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Resolucion de release
// ---------------------------------------------------------------------------
async function resolveRelease(plugin) {
  const repoInfo = parseRepository(plugin);
  if (!repoInfo) return { available: false, releaseError: 'Sin repositorio GitHub definido.' };
  const base = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`;

  let release = await githubApi(`${base}/releases/latest`);
  if (release.notFound) {
    // Sin release "latest" (puede haber solo prereleases o ninguno): probamos la lista.
    const list = await githubApi(`${base}/releases?per_page=5`);
    if (Array.isArray(list) && list.length) release = list[0];
    else return { available: false, releaseError: 'El repositorio no tiene releases publicados.', repoInfo };
  }

  const version = String(release.tag_name || release.name || plugin.version || '').replace(/^v/i, '') || (plugin.version || '0.0.0');
  const assets = Array.isArray(release.assets) ? release.assets.filter(Boolean) : [];

  // 1) Patron declarado (por si el repo trae varios zips). 2) Primer .zip. 3) source zipball.
  let asset = null;
  const declaredPattern = (plugin.release && plugin.release.assetPattern) || (plugin.package && plugin.package.assetPattern) || '';
  if (declaredPattern) asset = assets.find(a => wildcardToRegExp(declaredPattern).test(String(a.name || '')));
  if (!asset) asset = assets.find(a => /\.zip$/i.test(String(a.name || '')));
  if (!asset) asset = assets[0];

  let downloadUrl = '';
  let fileName = '';
  let sizeBytes = 0;
  let usedZipball = false;

  if (asset) {
    downloadUrl = asset.browser_download_url;
    fileName = asset.name;
    sizeBytes = asset.size || 0;
  } else if (release.zipball_url) {
    // Ultimo recurso: el source zip autogenerado (se envuelve en repo-<hash>/).
    downloadUrl = release.zipball_url;
    fileName = `${repoInfo.repo}-${version}.zip`;
    usedZipball = true;
    warn(`${plugin.id}: sin assets en el release, uso source zipball. Sube un ZIP como asset para mayor fiabilidad.`);
  } else {
    return { available: false, releaseError: 'El release no tiene assets ni source zipball.', repoInfo, version };
  }

  let sha256 = '';
  try {
    const digest = await sha256AndSizeOf(downloadUrl);
    sha256 = digest.sha256;
    if (!sizeBytes) sizeBytes = digest.sizeBytes;
  } catch (e) {
    warn(`${plugin.id}: no pude calcular sha256 (${e.message}).`);
  }

  return {
    available: true,
    repoInfo,
    version,
    downloadUrl,
    fileName,
    sha256,
    sizeBytes,
    sizeLabel: formatByteSize(sizeBytes),
    usedZipball,
    releaseUrl: release.html_url || `https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/latest`,
    publishedAt: release.published_at || release.created_at || ''
  };
}

// ---------------------------------------------------------------------------
// Normalizacion del plugin resuelto (forma que la app espera)
// ---------------------------------------------------------------------------
function resolveAssetUrl(value, folder) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^(data:|https?:|file:)/i.test(text)) return text;
  return `${RAW_BASE}/${folder}/${text.replace(/^\.?\//, '')}`;
}

function buildResolvedPlugin(plugin, folder, release) {
  const images = plugin.images && typeof plugin.images === 'object' ? plugin.images : {};
  const folderUrl = `${RAW_BASE}/${folder}/`;
  const clean = { ...plugin };
  // Quitamos lo volatil del fuente para que no compita con lo resuelto.
  delete clean.downloadUrl;
  delete clean.fileName;
  delete clean.package;
  delete clean.releaseInfo;
  delete clean.enabled;

  return {
    ...clean,
    id: plugin.id || plugin.slug || folder,
    slug: plugin.slug || folder,
    installDirName: plugin.installDirName || plugin.slug || folder,
    version: release.version || plugin.version || '0.0.0',
    images,
    logoUrl: resolveAssetUrl(images.logo, folder),
    bannerUrl: resolveAssetUrl(images.banner, folder),
    screenshotUrls: Array.isArray(images.screenshots) ? images.screenshots.map(s => resolveAssetUrl(s, folder)).filter(Boolean) : [],
    // release.mode = "resolved" -> la app NO vuelve a llamar a la API: usa esto directo.
    release: { mode: 'resolved', resolvedAt: new Date().toISOString() },
    downloadUrl: release.downloadUrl || '',
    fileName: release.fileName || '',
    sha256: release.sha256 || '',
    sizeLabel: release.sizeLabel || '',
    package: release.available ? {
      format: 'zip',
      file: release.fileName || '',
      downloadUrl: release.downloadUrl || '',
      sha256: release.sha256 || '',
      sizeBytes: release.sizeBytes || 0,
      sizeLabel: release.sizeLabel || '',
      source: release.usedZipball ? 'github-source-zipball' : 'github-release-asset',
      updatedAt: release.publishedAt || ''
    } : {},
    releaseInfo: release.repoInfo ? {
      provider: 'github',
      owner: release.repoInfo.owner,
      repo: release.repoInfo.repo,
      tag: release.version ? `v${release.version}` : '',
      url: release.releaseUrl || '',
      publishedAt: release.publishedAt || ''
    } : {},
    links: { ...(plugin.links || {}), release: release.releaseUrl || (plugin.links && plugin.links.release) || '' },
    available: Boolean(release.available && release.downloadUrl),
    releaseError: release.releaseError || '',
    remotePluginFolderUrl: folderUrl,
    remoteManifestUrl: `${folderUrl}plugin.json`
  };
}

// ---------------------------------------------------------------------------
// Secciones automaticas por host / tipo
// ---------------------------------------------------------------------------
function hostSet(plugin) {
  return new Set([...(plugin.host || []), ...(plugin.tags || [])].map(s => String(s).toLowerCase()));
}
function isAfterEffects(plugin) { const h = hostSet(plugin); return h.has('after effects'); }
function isPremiere(plugin) { const h = hostSet(plugin); return h.has('premiere pro') || h.has('premiere'); }
function isPsAi(plugin) { const h = hostSet(plugin); return h.has('illustrator') || h.has('photoshop'); }
function isDocklet(plugin) { return plugin.type === 'clipdock-window' || plugin.installMode === 'clipdock-window'; }

function buildSections(baseUi, plugins) {
  const ids = list => list.map(p => p.id);
  const heroList = (baseUi.hero && Array.isArray(baseUi.hero.plugins) ? baseUi.hero.plugins : [])
    .filter(id => plugins.some(p => p.id === id));
  const featuredList = heroList.length ? heroList : plugins.slice(0, 6).map(p => p.id);

  const sections = [
    { id: 'featured', title: 'Destacado para empezar', subtitle: 'Lo principal para probar la tienda y ampliar ClipDock.', filter: 'all', actionLabel: 'Ver todo', plugins: featuredList },
    { id: 'after-effects', title: 'After Effects', subtitle: 'Scripts y paneles para animacion, limpieza y control.', filter: 'after-effects', actionLabel: 'Abrir After Effects', plugins: ids(plugins.filter(isAfterEffects)) },
    { id: 'premiere', title: 'Premiere', subtitle: 'Herramientas para organizar y mover contenido en Premiere.', filter: 'premiere', actionLabel: 'Abrir Premiere', plugins: ids(plugins.filter(isPremiere)) },
    { id: 'illustrator-photoshop', title: 'Illustrator y Photoshop', subtitle: 'Puentes y utilidades para vector y composicion.', filter: 'illustrator-photoshop', actionLabel: 'Ver todo', plugins: ids(plugins.filter(isPsAi)) },
    { id: 'clipdock-utility', title: 'Docklets', subtitle: 'Mini ventanas acoplables que expanden la barra lateral de ClipDock.', filter: 'clipdock-utility', actionLabel: 'Abrir Docklets', plugins: ids(plugins.filter(isDocklet)) }
  ];
  return sections.filter(s => s.plugins.length);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const config = readJson(CONFIG_FILE);
  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => !name.startsWith('_') && !name.startsWith('.')) // _template, .git, etc.
    .sort();

  const folders = [];
  const resolved = [];

  for (const folder of entries) {
    const manifestPath = path.join(PLUGINS_DIR, folder, 'plugin.json');
    if (!fs.existsSync(manifestPath)) continue;
    let plugin;
    try { plugin = readJson(manifestPath); }
    catch (e) { warn(`${folder}: plugin.json invalido (${e.message}). Omitido.`); continue; }

    if (plugin.enabled === false) { log(`${folder}: enabled:false -> omitido.`); continue; }

    folders.push(folder);
    log(`Resolviendo ${plugin.id || folder}...`);
    let release;
    try { release = await resolveRelease(plugin); }
    catch (e) { warn(`${folder}: fallo al resolver release (${e.message}).`); release = { available: false, releaseError: e.message }; }

    const entry = buildResolvedPlugin(plugin, folder, release);
    resolved.push(entry);
    if (entry.available) log(`  -> v${entry.version}  ${entry.fileName}  ${entry.sizeLabel}  sha256:${entry.sha256.slice(0, 12)}...`);
    else warn(`  -> NO disponible: ${entry.releaseError}`);
  }

  // Indice de carpetas (autogenerado)
  const today = new Date().toISOString().slice(0, 10);
  const indexOut = { schema: 'clipdock.registry.index.v1', updatedAt: today, folders };
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexOut, null, 2) + '\n', 'utf8');

  // Catalogo resuelto (lo que lee la app)
  const ui = { ...(config.ui || {}) };
  ui.sections = buildSections(config.ui || {}, resolved);
  const resolvedOut = {
    schema: config.schema || 'clipdock.registry.v2',
    registryVersion: config.registryVersion || 2,
    updatedAt: today,
    name: config.name || 'ClipDock Marketplace 2.0',
    discovery: config.discovery || {},
    ui,
    generatedAt: new Date().toISOString(),
    registryMode: 'resolved-folder-index',
    plugins: resolved
  };
  fs.writeFileSync(RESOLVED_FILE, JSON.stringify(resolvedOut, null, 2) + '\n', 'utf8');

  const okCount = resolved.filter(p => p.available).length;
  log(`Listo: ${resolved.length} plugins (${okCount} disponibles), ${resolved.length - okCount} pendientes.`);
  const broken = resolved.filter(p => !p.available);
  if (broken.length) {
    warn('Plugins sin descarga usable:');
    broken.forEach(p => warn(`  - ${p.id}: ${p.releaseError}`));
  }
}

main().catch(err => { console.error('[build-catalog] ERROR FATAL:', err); process.exit(1); });
