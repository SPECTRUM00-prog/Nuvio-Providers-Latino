#!/usr/bin/env node
/**
 * test_cf_pelisgo4.js — fase 4: encontrar getAntiBotToken (generador de x-session-id)
 *
 * Hallazgos de la fase 3 (test_cf_pelisgo3.js):
 *   - La llamada real al stream es:
 *       let t = await getAntiBotToken();
 *       s["x-session-id"] = t   (si hay token)
 *       fetch(`/api/movies/${movieId}/stream`, ...)
 *   - El token NO es el csrf de Auth.js (S1..S4 dieron 403) ni un uuid libre (S6 403).
 *   - getAntiBotToken se importa del modulo webpack 98641.
 *
 * Esta prueba:
 *   A) Descarga TODOS los chunks JS del sitio y los guarda en pelisgo_chunk_*.js
 *      (ademas intenta chunks "lazy" derivados del runtime de webpack).
 *   B) Busca la DEFINICION de getAntiBotToken / modulo 98641 con contexto amplio,
 *      mas pistas de turnstile/altcha/pow/sha256 y el inventario de endpoints /api/.
 *   C) Sondea los endpoints candidatos (antibot/challenge/token/captcha...)
 *      y reintenta el stream con cualquier token que aparezca en sus respuestas.
 *
 * Uso: node test_cf_pelisgo4.js matrix [movieId]
 * Sale: consola + pelisgo_pistas2.txt
 */
'use strict';

const fs = require('fs');
const path = require('path');

const slug = (process.argv[2] || 'matrix').trim();
const movieIdArg = (process.argv[3] || '').trim();
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

async function bajarChunk(u) {
  try {
    const r = await fetchTo(BASE + u, {
      headers: { ...BROWSER, Referer: PAGE_URL, Accept: '*/*', 'Sec-Fetch-Dest': 'script', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Site': 'same-origin' },
    });
    takeCookies(r);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

/* ---------- patrones de la fase B ---------- */
const PATTERNS_B = [
  { tag: 'DEF-getAntiBotToken', re: /getAntiBotToken/g, ctx: 1400, consoleMax: 5, fileMax: 8 },
  { tag: 'MOD-98641', re: /\b98641\s*[:=]/g, ctx: 1400, consoleMax: 3, fileMax: 3 },
  { tag: 'x-session-id', re: /x-session-id/gi, ctx: 800, consoleMax: 6, fileMax: 8 },
  { tag: 'api/movies', re: /api\/movies/g, ctx: 1500, consoleMax: 3, fileMax: 3 },
  { tag: 'captcha/pow', re: /turnstile|sitekey|altcha|recaptcha|hcaptcha|challenge|difficulty|proof/gi, ctx: 500, consoleMax: 6, fileMax: 12 },
  { tag: 'hash', re: /sha-?256|subtle\.digest|createHash/gi, ctx: 400, consoleMax: 5, fileMax: 10 },
];

(async () => {
  let movieId = movieIdArg;
  const apiPaths = new Map();
  const probes = [];
  const streamRetry = [];
  let ganador = null;
  let antibotDef = '';
  let mod98641Ctx = '';
  let apiMoviesFull = '';
  let chunksBajados = 0;

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
      global.__html = html;
    }
  } catch (e) { line('ERROR fase 0: ' + e.message); }

  const corpus = [];
  try {
    /* fase A: descargar TODOS los chunks */
    sep('A', 'Descarga de todos los chunks JS (~40 s)');
    let html = global.__html || '';
    if (!html) {
      try {
        const r0 = await fetchTo(PAGE_URL, { headers: { ...BROWSER, Accept: 'text/html,*/*;q=0.8' } });
        takeCookies(r0);
        html = await r0.text();
      } catch (e) {}
    }
    let urls = [...new Set(html.match(CHUNK_RE) || [])];
    try {
      const rh = await fetchTo(BASE + '/', { headers: { ...BROWSER, Accept: 'text/html,*/*;q=0.8' } });
      takeCookies(rh);
      urls = urls.concat(rh.text ? [] : []);
      const hh = await rh.text();
      urls = urls.concat(hh.match(CHUNK_RE) || []);
    } catch (e) {}
    urls = [...new Set(urls)].slice(0, 90);
    line('chunks detectados en HTML: ' + urls.length);

    for (let i = 0; i < urls.length; i += 6) {
      const lote = await Promise.all(urls.slice(i, i + 6).map(u => bajarChunk(u)));
      for (let j = 0; j < lote.length; j++) {
        const txt = lote[j];
        if (txt == null) continue;
        chunksBajados++;
        const name = urls[i + j].replace('/_next/static/chunks/', '');
        corpus.push({ name, text: txt });
        const fname = 'pelisgo_chunk_' + name.replace(/\.js$/, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.js';
        try { fs.writeFileSync(fname, txt); } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 100));
    }
    line('descargados: ' + chunksBajados);

    /* fase A2: chunks "lazy" derivados del runtime de webpack */
    try {
      const extras = new Set();
      for (const { text } of corpus) {
        const pares = text.match(/\{(?:\s*["']?\w{1,6}["']?\s*:\s*["'][0-9a-f]{8,32}["']\s*,?){2,}\}/g) || [];
        for (const p of pares) {
          const m2 = p.matchAll(/["']?(\w{1,6})["']?\s*:\s*["']([0-9a-f]{8,32})["']/g);
          for (const [, id, hash] of m2) {
            extras.add('/_next/static/chunks/' + id + '.' + hash + '.js');
          }
        }
      }
      const listaExtras = [...extras].slice(0, 40).filter(u => !urls.includes(u));
      if (listaExtras.length) {
        line('chunks lazy derivados del runtime: ' + listaExtras.length);
        for (let i = 0; i < listaExtras.length; i += 6) {
          const lote = await Promise.all(listaExtras.slice(i, i + 6).map(u => bajarChunk(u)));
          for (let j = 0; j < lote.length; j++) {
            const txt = lote[j];
            if (txt == null) continue;
            chunksBajados++;
            const name = listaExtras[i + j].replace('/_next/static/chunks/', '');
            corpus.push({ name, text: txt });
            const fname = 'pelisgo_chunk_' + name.replace(/\.js$/, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.js';
            try { fs.writeFileSync(fname, txt); } catch (e) {}
          }
        }
        line('total tras lazy: ' + chunksBajados);
      }
    } catch (e) {}
  } catch (e) { line('ERROR fase A: ' + e.message); }

  try {
    /* fase B: cazar la definicion */
    sep('B', 'Definicion de getAntiBotToken y pistas');
    for (const { name, text } of corpus) {
      for (const p of PATTERNS_B) {
        p.re.lastIndex = 0;
        let m, n = 0;
        while ((m = p.re.exec(text)) !== null && n < p.fileMax) {
          const ini = Math.max(0, m.index - p.ctx);
          const fin = Math.min(text.length, m.index + m[0].length + p.ctx);
          const ctx = text.slice(ini, fin).replace(/\s+/g, ' ');
          if (p.tag === 'DEF-getAntiBotToken') {
            const esDef = /getAntiBotToken\s*[:=]\s*(async\s*)?(function|\()/.test(ctx) || /function\s+getAntiBotToken\s*\(/.test(ctx) || /getAntiBotToken\s*=\s*async\s*\(?\s*\)?\s*=>/.test(ctx);
            if (esDef && ctx.length > antibotDef.length) antibotDef = ctx;
          }
          if (p.tag === 'MOD-98641' && ctx.length > mod98641Ctx.length) mod98641Ctx = ctx;
          if (p.tag === 'api/movies' && !apiMoviesFull) apiMoviesFull = ctx;
          if (p.tag !== 'api/movies' || n < p.consoleMax) {
            out('   [' + p.tag + '] ' + name + ':');
            out('     > ' + clip(ctx, p.ctx <= 500 ? 600 : 1600));
          }
          n++;
          if (m.index === p.re.lastIndex) p.re.lastIndex++;
        }
      }
      /* inventario de endpoints /api/ */
      const reApi = /["'`](\/api\/[A-Za-z0-9\-_.]+)["'`]/g;
      let m3;
      while ((m3 = reApi.exec(text)) !== null) {
        apiPaths.set(m3[1], (apiPaths.get(m3[1]) || 0) + 1);
      }
    }
    out('   --- Inventario de endpoints /api/ usados por el frontend ---');
    const inv = [...apiPaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    for (const [p, c] of inv) out('     ' + p + '  (x' + c + ')');
  } catch (e) { line('ERROR fase B: ' + e.message); }

  try {
    /* fase C: sondear endpoints candidatos y reintentar stream */
    sep('C', 'Sondeo de endpoints candidatos y reintento del stream');
    const score = p => (/antibot/i.test(p) ? 0 : /challenge|captcha|altcha/i.test(p) ? 1 : /token/i.test(p) ? 2 : /session|init|guard|shield|protect/i.test(p) ? 3 : 4);
    const candidatos = [...apiPaths.keys()]
      .filter(p => p.length > 5 && !/^\/api\/movies/.test(p) && !/^\/api\/auth/.test(p))
      .sort((a, b) => score(a) - score(b))
      .slice(0, 6);
    const supuestos = ['/api/antibot', '/api/challenge', '/api/antibot-token', '/api/session-token'];
    for (const s of supuestos) if (!candidatos.includes(s)) candidatos.push(s);

    const tokens = [];
    for (const cpath of candidatos.slice(0, 8)) {
      let status = 0, body = '', metodo = 'GET';
      try {
        let r = await fetchTo(BASE + cpath, {
          headers: { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(), 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' },
        });
        takeCookies(r);
        status = r.status; body = await r.text();
        if (status === 404 || status === 405) {
          metodo = 'POST';
          r = await fetchTo(BASE + cpath, {
            method: 'POST',
            headers: { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(), 'Content-Type': 'application/json', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' },
            body: '{}',
          });
          takeCookies(r);
          status = r.status; body = await r.text();
        }
        probes.push({ path: cpath, method: metodo, status, body: clip(body, 300) });
        line((metodo + ' ' + cpath + ' -> ' + status).padEnd(46) + ' body: ' + clip(body, 240));
        /* extraer token de la respuesta */
        let tok = '';
        const limpio = body.trim();
        if (/^[A-Za-z0-9_\-=+]{16,}$/.test(limpio)) tok = limpio;
        else {
          try {
            const j = JSON.parse(body);
            for (const v of Object.values(j)) {
              if (typeof v === 'string' && v.length >= 16 && /^[A-Za-z0-9_\-=+:.|]{16,}$/.test(v)) { tok = v; break; }
            }
          } catch (e) {}
        }
        if (tok && !tokens.includes(tok) && tokens.length < 3) tokens.push(tok);
      } catch (e) { line('GET ' + cpath + ' -> ERROR ' + e.message); }
    }

    if (!movieId) line('(sin movieId no se reintenta el stream)');
    const reintentos = tokens.map((t, i) => ['T' + (i + 1) + ' token de ' + (probes.find(p => p.body && p.body.length && t && p.body.includes(t.slice(0, 12))) ? probes.find(p => p.body.includes(t.slice(0, 12))).path : '?'), t]);
    for (const [etiqueta, valor] of reintentos) {
      try {
        const r = await fetchTo(BASE + '/api/movies/' + movieId + '/stream', {
          headers: { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(), 'x-session-id': valor, 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' },
        });
        const b = await r.text();
        streamRetry.push({ etiqueta, status: r.status });
        line(etiqueta + ' [len ' + valor.length + '] -> ' + r.status);
        line('   body: ' + clip(b, 600));
        if (r.status === 200) { ganador = { etiqueta, valor, body: b }; break; }
      } catch (e) { line(etiqueta + ' -> ERROR ' + e.message); }
    }
    if (ganador) {
      console.log('\n>>> GANADOR: ' + ganador.etiqueta + ' <<<');
      console.log('>>> BODY COMPLETO DEL STREAM:');
      console.log(ganador.body.slice(0, 3000));
    }
  } catch (e) { line('ERROR fase C: ' + e.message); }

  /* ---------- resumen ---------- */
  console.log('\n' + '='.repeat(56));
  out('RESUMEN (pega esto en el chat, incluye la definicion de getAntiBotToken):');
  out(JSON.stringify({
    slug,
    movieId,
    chunksBajados,
    antibotDef: antibotDef ? clip(antibotDef, 1800) : '(NO ENCONTRADA en los chunks bajados)',
    mod98641: mod98641Ctx ? clip(mod98641Ctx, 1200) : '',
    apiMoviesFull: apiMoviesFull ? clip(apiMoviesFull, 1200) : '',
    apiPaths: [...apiPaths.keys()].slice(0, 25),
    probes: probes.map(p => p.method + ' ' + p.path + ' -> ' + p.status + ' :: ' + p.body.slice(0, 120)),
    streamRetry: streamRetry.map(s => s.etiqueta + ' -> ' + s.status),
    ganador: ganador ? ganador.etiqueta : 'ninguno',
    pistas: 'pelisgo_pistas2.txt',
  }));
  try { fs.writeFileSync('pelisgo_pistas2.txt', pistas.join('\n') + '\n'); console.log('\nDetalle completo en pelisgo_pistas2.txt (misma carpeta).'); } catch (e) {}
})().catch(e => { console.log('ERROR fatal: ' + (e && e.message)); }); 
