#!/usr/bin/env node
/**
 * test_cf_pelisgo2.js — descubre el mecanismo de sesion de pelisgo.online
 *
 * Contexto de la prueba anterior (test_cf_pelisgo.js):
 *   - home / search / pagina de pelicula responden 200 (Cloudflare no bloquea).
 *   - /api/movies/{id}/stream responde 403 con JSON de la propia app:
 *       {"error":"Sesion no valida o expirada"}
 *   - La pagina NO trae links ni embeds: la unica via es la API.
 *   - Ninguna respuesta entrega cookies -> la "sesion" la crea el JavaScript
 *     del navegador, no el HTML.
 *
 * Esta prueba espia los chunks JS del frontend para ver COMO llama el
 * navegador real a la API (metodo, cabeceras, token/sesion/cookie), sondea
 * endpoints de sesion tipicos y reintenta el stream con lo recolectado.
 *
 * Uso:   node test_cf_pelisgo2.js matrix
 * Sale:  consola + pelisgo_informe.txt  (+ pelisgo_chunk_*.js si hay hallazgos)
 */
'use strict';

const fs = require('fs');

const slug = (process.argv[2] || 'matrix').trim();
const BASE = (process.env.PELISGO_BASE || 'https://pelisgo.online').replace(/\/+$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_URL = BASE + '/movies/' + slug;
const CHUNK_RE = /\/_next\/static\/[A-Za-z0-9_.\/%[\]-]+\.js/g;

/* ---------- frasco de cookies ---------- */
const jar = new Map();
function getSetCookies(res) {
  try { if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie(); } catch (e) {}
  const raw = res.headers.get('set-cookie') || '';
  if (!raw) return [];
  return raw.split(/,(?=[A-Za-z0-9_$-]+=[^;]*)/).map(s => s.trim()).filter(Boolean);
}
function takeCookies(res) {
  const tomadas = [];
  for (const c of getSetCookies(res)) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) { jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); tomadas.push(pair.trim()); }
  }
  return tomadas;
}
function cookieHeader() { return Array.from(jar, ([k, v]) => k + '=' + v).join('; '); }

/* ---------- utilidades ---------- */
const informe = [];
function out(s) { console.log(s); informe.push(String(s)); }
function sep(n, t) { console.log('\n' + '-'.repeat(16) + ' [' + n + '] ' + t + ' ' + '-'.repeat(16)); }
function line(s) { out('   ' + s); }
function clip(s, n) { s = String(s).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) : s; }

const BROWSER = {
  'User-Agent': UA,
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
  'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

function fetchTo(url, opts = {}, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}

/* ---------- patrones a cazar en el JS del sitio ---------- */
const PATTERNS = [
  { tag: 'LLAMADA-API',   re: /api\/movies/g, ctx: 450, consoleMax: 5, fileMax: 5, saveChunk: true },
  { tag: 'x-headers',     re: /["'`](x-[a-z0-9_-]{2,30})["'`]/gi, ctx: 180, consoleMax: 6, fileMax: 8, saveChunk: true },
  { tag: 'fetch-wrapper', re: /window\.fetch\s*=|globalThis\.fetch\s*=|self\.fetch\s*=/g, ctx: 220, consoleMax: 3, fileMax: 2, saveChunk: true },
  { tag: 'urls-api',      re: /["'`]https?:\/\/[^"'`\s]*(?:api|stream|backend)[^"'`\s]*["'`]/gi, ctx: 160, consoleMax: 4, fileMax: 8 },
  { tag: 'session',       re: /session/gi, ctx: 150, consoleMax: 4, fileMax: 8 },
  { tag: 'expirada',      re: /sesi[oó]n no v|expirad|expired/gi, ctx: 150, consoleMax: 3, fileMax: 4 },
  { tag: 'csrf',          re: /csrf/gi, ctx: 150, consoleMax: 3, fileMax: 4 },
  { tag: 'cookie-js',     re: /document\.cookie/gi, ctx: 150, consoleMax: 3, fileMax: 4 },
  { tag: 'localStorage',  re: /localStorage/gi, ctx: 120, consoleMax: 3, fileMax: 4 },
  { tag: 'authorization', re: /authorization/gi, ctx: 150, consoleMax: 3, fileMax: 4 },
  { tag: 'token-gen',     re: /randomUUID|nanoid|uuidv4|getRandomValues/gi, ctx: 130, consoleMax: 3, fileMax: 4 },
];

(async () => {
  const findings = [];
  const savedChunks = new Set();
  let movieId = '';
  let html = '';
  let corpusSize = 0;
  const probeResults = [];
  const streamRetry = [];

  try {
    /* [1] pagina de la pelicula */
    sep('1/4', 'GET ' + PAGE_URL);
    const res = await fetchTo(PAGE_URL, {
      headers: {
        ...BROWSER,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1',
      },
    });
    const sc = takeCookies(res);
    line('status: ' + res.status + '  cf-ray: ' + (res.headers.get('cf-ray') || '-') + '  server: ' + (res.headers.get('server') || '-'));
    line('set-cookie: ' + (sc.length ? sc.join(' | ') : '(ninguna)'));
    html = await res.text();
    line('bytes: ' + html.length);
    const m = html.match(/movieId[\\":\s]+([A-Za-z0-9_-]{10,})/) || html.match(/movieId=([A-Za-z0-9_-]{10,})/);
    movieId = m ? m[1] : '';
    line('movieId: ' + (movieId || '(NO ENCONTRADO)'));
  } catch (e) { line('ERROR fase 1: ' + e.message); }

  try {
    /* [2] chunks del frontend */
    sep('2/4', 'Chunks JS del frontend (aqui vive la llamada real a la API, ~30 s)');
    let urls = [...new Set((html.match(CHUNK_RE) || []))];
    try {
      const rh = await fetchTo(BASE + '/', { headers: { ...BROWSER, Accept: 'text/html,*/*;q=0.8', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate' } });
      takeCookies(rh);
      const hh = await rh.text();
      urls = urls.concat(hh.match(CHUNK_RE) || []);
      line('home: ' + rh.status + '  bytes: ' + hh.length);
    } catch (e) { line('home: ERROR ' + e.message); }
    urls = [...new Set(urls)].slice(0, 80);
    line('chunks unicos a descargar: ' + urls.length);

    const corpus = [{ name: 'HTML-pagina', text: html }];
    let okc = 0, failc = 0;
    for (let i = 0; i < urls.length; i += 6) {
      const lote = urls.slice(i, i + 6);
      const resultados = await Promise.all(lote.map(async u => {
        try {
          const r = await fetchTo(BASE + u, {
            headers: { ...BROWSER, Referer: PAGE_URL, Accept: '*/*', 'Sec-Fetch-Dest': 'script', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Site': 'same-origin' },
          });
          takeCookies(r);
          if (!r.ok) return [u, null];
          return [u, await r.text()];
        } catch (e) { return [u, null]; }
      }));
      for (const [u, txt] of resultados) {
        if (txt == null) { failc++; continue; }
        okc++;
        corpus.push({ name: u.replace('/_next/static/chunks/', ''), text: txt });
      }
      await new Promise(r => setTimeout(r, 120));
    }
    corpusSize = corpus.length - 1;
    line('descargados: ' + okc + '  fallidos: ' + failc);

    for (const { name, text } of corpus) {
      if (findings.length > 2000) break;
      for (const p of PATTERNS) {
        p.re.lastIndex = 0;
        let m2, n = 0;
        while ((m2 = p.re.exec(text)) !== null && n < p.fileMax) {
          const ini = Math.max(0, m2.index - p.ctx);
          findings.push({ tag: p.tag, where: name, ctx: text.slice(ini, Math.min(text.length, m2.index + m2[0].length + p.ctx)).replace(/\s+/g, ' ') });
          if (p.saveChunk && name !== 'HTML-pagina' && !savedChunks.has(name)) {
            const fname = 'pelisgo_chunk_' + name.replace(/\.js$/, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(-60) + '.js';
            try { fs.writeFileSync(fname, text); savedChunks.add(name); } catch (e) {}
          }
          n++;
          if (m2.index === p.re.lastIndex) p.re.lastIndex++;
        }
      }
    }

    console.log('');
    out('--- Hallazgos por patron (contexto alrededor de cada coincidencia) ---');
    for (const p of PATTERNS) {
      const list = findings.filter(f => f.tag === p.tag);
      if (!list.length) { out('   [' + p.tag + '] sin coincidencias'); continue; }
      const dondes = Array.from(new Set(list.map(f => f.where))).slice(0, 4).join(', ');
      out('   [' + p.tag + '] ' + list.length + ' coincidencia(s)  en: ' + dondes);
      for (const f of list.slice(0, p.consoleMax)) out('     > ' + clip(f.ctx, 700));
    }
  } catch (e) { line('ERROR fase 2: ' + e.message); }

  try {
    /* [3] sondeo de endpoints de sesion */
    sep('3/4', 'Sondeo de endpoints de sesion tipicos');
    const probes = [
      ['GET', '/api/auth/session'],
      ['GET', '/api/auth/csrf'],
      ['POST', '/api/auth/csrf'],
      ['GET', '/api/session'],
      ['POST', '/api/session'],
      ['POST', '/api/session/init'],
    ];
    for (const [metodo, path] of probes) {
      try {
        const r = await fetchTo(BASE + path, {
          method: metodo,
          headers: {
            ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(),
            'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin',
            ...(metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          body: metodo === 'POST' ? '{}' : undefined,
        });
        const sc3 = takeCookies(r);
        const b3 = await r.text();
        probeResults.push({ metodo, path, status: r.status, setCookie: sc3, body: clip(b3, 240) });
        line(metodo.padEnd(4) + ' ' + path + ' -> ' + r.status + (sc3.length ? '  set-cookie: ' + sc3.map(c => c.split(';')[0]).join(', ') : ''));
        line('      body: ' + clip(b3, 220));
      } catch (e) { line(metodo.padEnd(4) + ' ' + path + ' -> ERROR ' + e.message); }
    }
  } catch (e) { line('ERROR fase 3: ' + e.message); }

  try {
    /* [4] reintento del stream con lo recolectado */
    sep('4/4', 'Reintento /api/movies/' + (movieId || '???') + '/stream');
    if (!movieId) {
      line('(sin movieId no se puede reintentar)');
    } else {
      const url = BASE + '/api/movies/' + movieId + '/stream';
      const variantes = [
        ['V1 GET + cookies', { method: 'GET', headers: { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Cookie: cookieHeader() } }],
        ['V2 GET + cookies + Origin + sec-fetch', { method: 'GET', headers: { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(), 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' } }],
        ['V3 POST + cookies', { method: 'POST', headers: { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(), 'Content-Type': 'application/json', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' }, body: '{}' }],
      ];
      for (const [etiqueta, opts] of variantes) {
        try {
          const r = await fetchTo(url, opts);
          const sc4 = takeCookies(r);
          const b4 = await r.text();
          streamRetry.push({ variante: etiqueta, status: r.status, body: clip(b4, 200) });
          line(etiqueta + ' -> ' + r.status + (sc4.length ? '  set-cookie: ' + sc4.map(c => c.split(';')[0]).join(', ') : ''));
          line('      body: ' + clip(b4, 200));
        } catch (e) { line(etiqueta + ' -> ERROR ' + e.message); }
      }
    }
  } catch (e) { line('ERROR fase 4: ' + e.message); }

  /* ---------- resumen ---------- */
  const porTag = {};
  for (const f of findings) porTag[f.tag] = (porTag[f.tag] || 0) + 1;
  const xHeaders = Array.from(new Set(
    findings.filter(f => f.tag === 'x-headers')
      .map(f => (f.ctx.match(/x-[a-z0-9_-]{2,30}/i) || [''])[0])
      .filter(Boolean)
  ));
  console.log('\n' + '='.repeat(56));
  out('RESUMEN (pega esto en el chat):');
  out(JSON.stringify({
    slug,
    movieId,
    cookies: Array.from(jar.keys()),
    chunksDescargados: corpusSize,
    hallazgosPorPatron: porTag,
    xHeaders,
    sondeos: probeResults.map(p => p.metodo + ' ' + p.path + ' -> ' + p.status + (p.setCookie.length ? ' [+cookie: ' + p.setCookie.map(c => c.split('=')[0]).join(',') + ']' : '')),
    streamRetry: streamRetry.map(s => s.variante + ' -> ' + s.status),
    chunksGuardados: Array.from(savedChunks),
    informe: 'pelisgo_informe.txt',
  }));
  try { fs.writeFileSync('pelisgo_informe.txt', informe.join('\n') + '\n'); console.log('\nDetalle completo en pelisgo_informe.txt (misma carpeta).'); } catch (e) {}
})().catch(e => { console.log('ERROR fatal: ' + (e && e.message)); }); 
