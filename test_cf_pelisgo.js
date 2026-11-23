#!/usr/bin/env node
/**
 * test_cf_pelisgo3.js — fase 3: identificar COMO se genera x-session-id
 *
 * Hallazgos de la fase 2 (test_cf_pelisgo2.js):
 *   - El sitio usa Auth.js v5 (cookies __Host-authjs.csrf-token,
 *     __Secure-authjs.callback-url; /api/auth/* responden 200).
 *   - El header propio de la app es x-session-id -> casi seguro es lo que
 *     valida /api/movies/{id}/stream ("Sesion no valida o expirada").
 *   - POST al stream da 405 -> el metodo correcto es GET.
 *
 * Esta prueba (correr en la MISMA carpeta donde quedaron pelisgo_chunk_*.js):
 *   A) Analiza offline los chunks guardados con contexto amplio para ver
 *      como se genera y usa x-session-id.
 *   B) Consulta /api/auth/session y /api/auth/csrf completos (body + cookies).
 *   C) Reintenta el stream enviando x-session-id con valores derivados del
 *      token CSRF (doble envio) y de un UUID aleatorio.
 *
 * Uso: node test_cf_pelisgo3.js matrix [movieId]
 *      (el movieId es opcional: si lo das, no vuelve a bajar la pagina)
 * Sale: consola + pelisgo_pistas.txt
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const slug = (process.argv[2] || 'matrix').trim();
const movieIdArg = (process.argv[3] || '').trim();
const BASE = (process.env.PELISGO_BASE || 'https://pelisgo.online').replace(/\/+$/, '');
const CHUNK_DIR = process.env.PELISGO_CHUNK_DIR || process.cwd();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_URL = BASE + '/movies/' + slug;

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
const pistas = [];
function out(s) { console.log(s); pistas.push(String(s)); }
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

/* ---------- patrones de la fase A (chunks locales) ---------- */
const PATTERNS_A = [
  { tag: 'x-session-id', re: /x-session-id/gi, ctx: 700, fileMax: 6 },
  { tag: 'api/movies',   re: /api\/movies/g, ctx: 700, fileMax: 3 },
  { tag: 'sessionId',    re: /sessionId|session_id/gi, ctx: 350, fileMax: 8 },
  { tag: 'error-sesion', re: /expirad|Sesi[oó]n no v|expired/gi, ctx: 400, fileMax: 3 },
  { tag: 'auth',         re: /authjs|\/api\/auth\/|signIn|credentials/gi, ctx: 350, fileMax: 8 },
  { tag: 'uuid-gen',     re: /randomUUID|nanoid|uuidv4|getRandomValues/gi, ctx: 250, fileMax: 6 },
  { tag: 'fetch-wrapper', re: /window\.fetch\s*=|globalThis\.fetch\s*=|self\.fetch\s*=/g, ctx: 500, fileMax: 2 },
  { tag: 'localStorage', re: /localStorage/gi, ctx: 200, fileMax: 10 },
];

(async () => {
  let movieId = movieIdArg;
  const resultsC = [];
  let ganador = null;
  let sessionBody = '';
  let csrfBodyStr = '';
  let csrfFromBody = '';
  let csrfCookieLen = 0;
  let archivosCount = 0;
  const resumenA = {};
  let primerCtxXSid = '';
  let primerCtxApi = '';

  try {
    /* fase 0: movieId */
    if (movieId) {
      sep('0', 'movieId dado por argumento: ' + movieId);
    } else {
      sep('0', 'GET ' + PAGE_URL + ' (para obtener el movieId)');
      const res = await fetchTo(PAGE_URL, {
        headers: { ...BROWSER, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate' },
      });
      takeCookies(res);
      const html = await res.text();
      line('status: ' + res.status + '  bytes: ' + html.length);
      const m = html.match(/movieId[\\":\s]+([A-Za-z0-9_-]{10,})/);
      movieId = m ? m[1] : '';
      line('movieId: ' + (movieId || '(NO ENCONTRADO)'));
    }
  } catch (e) { line('ERROR fase 0: ' + e.message); }

  try {
    /* fase A: analisis offline de los chunks guardados por test_cf_pelisgo2.js */
    sep('A', 'Analisis offline de pelisgo_chunk_*.js (contexto amplio)');
    const archivos = fs.readdirSync(CHUNK_DIR).filter(f => /^pelisgo_chunk_.*\.js$/.test(f)).sort();
    archivosCount = archivos.length;
    if (!archivos.length) {
      line('No hay pelisgo_chunk_*.js en ' + CHUNK_DIR);
      line('(corre antes test_cf_pelisgo2.js en esta carpeta; la fase C sigue igual)');
    } else {
      line('chunks encontrados: ' + archivos.length + ' -> ' + archivos.join(', '));
    }
    for (const archivo of archivos) {
      let texto = '';
      try { texto = fs.readFileSync(path.join(CHUNK_DIR, archivo), 'utf8'); } catch (e) { continue; }
      for (const p of PATTERNS_A) {
        p.re.lastIndex = 0;
        let m, n = 0;
        while ((m = p.re.exec(texto)) !== null && n < p.fileMax) {
          const ini = Math.max(0, m.index - p.ctx);
          const fin = Math.min(texto.length, m.index + m[0].length + p.ctx);
          const ctx = texto.slice(ini, fin).replace(/\s+/g, ' ');
          resumenA[p.tag] = (resumenA[p.tag] || 0) + 1;
          if (p.tag === 'x-session-id' && !primerCtxXSid) primerCtxXSid = ctx;
          if (p.tag === 'api/movies' && !primerCtxApi) primerCtxApi = ctx;
          out('   [' + p.tag + '] ' + archivo + ':');
          out('     > ' + clip(ctx, p.tag === 'x-session-id' || p.tag === 'api/movies' ? 1400 : 700));
          n++;
          if (m.index === p.re.lastIndex) p.re.lastIndex++;
        }
      }
    }
    if (!archivosCount) out('   (sin chunks locales que analizar)');
  } catch (e) { line('ERROR fase A: ' + e.message); }

  try {
    /* fase B: endpoints de Auth.js completos */
    sep('B', 'Endpoints de Auth.js (body completo + cookies)');
    const authProbe = async pathname => {
      const r = await fetchTo(BASE + pathname, {
        headers: { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' },
      });
      const sc = takeCookies(r);
      const b = await r.text();
      line('GET ' + pathname + ' -> ' + r.status);
      line('   set-cookie: ' + (sc.length ? sc.map(c => c.split(';')[0]).join(' | ') : '(ninguna)'));
      line('   body: ' + clip(b, 1000));
      return b;
    };
    sessionBody = await authProbe('/api/auth/session');
    csrfBodyStr = await authProbe('/api/auth/csrf');
    try { csrfFromBody = String(JSON.parse(csrfBodyStr).csrfToken || ''); } catch (e) {}
  } catch (e) { line('ERROR fase B: ' + e.message); }

  try {
    /* fase C: stream con x-session-id */
    sep('C', 'Stream con x-session-id (doble envio CSRF / uuid aleatorio)');
    if (!movieId) {
      line('(sin movieId, se omite)');
    } else {
      const csrfCookie = jar.get('__Host-authjs.csrf-token') || jar.get('__Secure-authjs.csrf-token') || jar.get('authjs.csrf-token') || jar.get('next-auth.csrf-token') || '';
      csrfCookieLen = csrfCookie.length;
      const partes = csrfCookie ? csrfCookie.split('|') : [];
      const cand = [];
      if (csrfCookie) cand.push(['S1 csrf-cookie completa', csrfCookie]);
      if (partes[0]) cand.push(['S2 csrf-cookie antes de |', partes[0]]);
      if (partes[1]) cand.push(['S3 csrf-cookie despues de |', partes[1]]);
      if (csrfFromBody) cand.push(['S4 csrfToken del body', csrfFromBody]);
      const idLike = (sessionBody.match(/[A-Za-z0-9_-]{20,}/g) || [])[0];
      if (idLike) cand.push(['S5 campo largo del body session', idLike]);
      cand.push(['S6 uuid aleatorio', crypto.randomUUID()]);

      const url = BASE + '/api/movies/' + movieId + '/stream';
      for (const [etiqueta, valor] of cand) {
        try {
          const r = await fetchTo(url, {
            headers: {
              ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE,
              Cookie: cookieHeader(), 'x-session-id': valor,
              'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin',
            },
          });
          const scC = takeCookies(r);
          const bC = await r.text();
          resultsC.push({ etiqueta, status: r.status });
          line(etiqueta + '  [len ' + valor.length + ', inicia "' + clip(valor, 10) + '"] -> ' + r.status + (scC.length ? '  set-cookie: ' + scC.map(c => c.split(';')[0]).join(', ') : ''));
          line('   body: ' + clip(bC, 400));
          if (r.status === 200) ganador = { etiqueta, valor };
        } catch (e) { line(etiqueta + ' -> ERROR ' + e.message); }
      }
      if (ganador) console.log('\n>>> GANADOR: ' + ganador.etiqueta + ' — el stream responde 200 con ese x-session-id <<<');
    }
  } catch (e) { line('ERROR fase C: ' + e.message); }

  /* ---------- resumen ---------- */
  console.log('\n' + '='.repeat(56));
  out('RESUMEN (pega esto en el chat):');
  out(JSON.stringify({
    slug,
    movieId,
    chunksAnalizados: archivosCount,
    hallazgosFaseA: resumenA,
    xsidCtx: primerCtxXSid ? clip(primerCtxXSid, 600) : '',
    apiMoviesCtx: primerCtxApi ? clip(primerCtxApi, 700) : '',
    authSessionBody: clip(sessionBody, 400),
    csrfBody: clip(csrfBodyStr, 200),
    csrfCookieLen,
    cookiesEnJar: Array.from(jar.keys()),
    pruebasStream: resultsC.map(r => r.etiqueta.split(' ')[0] + ':' + r.status),
    ganador: ganador ? ganador.etiqueta : 'ninguno',
    pistas: 'pelisgo_pistas.txt',
  }));
  try { fs.writeFileSync('pelisgo_pistas.txt', pistas.join('\n') + '\n'); console.log('\nDetalle completo en pelisgo_pistas.txt (misma carpeta).'); } catch (e) {}
})().catch(e => { console.log('ERROR fatal: ' + (e && e.message)); }); 
