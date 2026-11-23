#!/usr/bin/env node
/**
 * test_cf_pelisgo5.js — fase 5: confirmacion del mecanismo de sesion en tu maquina
 *
 * La fase 4 descubrio (modulo webpack 98641 del sitio):
 *   getAntiBotToken() -> POST /api/session/sync (Content-Type: application/json, sin body)
 *   -> JSON con sid | sessionId | token
 *   -> header "x-session-id" en /api/movies/{id}/stream (cache 10 min)
 *
 * Esta prueba lo verifica contra el sitio real, tal cual lo hara el provider v1.3:
 *   [1] POST /api/session/sync en dos variantes (con cookies de navegador y pelada,
 *       como la hara el provider en la TV, que no lleva cookies).
 *   [2] GET /api/movies/{id}/stream con x-session-id en 3 variantes:
 *       completa, MINIMA (solo UA+Accept+Referer+token, sin cookies) y repetida
 *       (para comprobar que el token no es de un solo uso).
 *   [3] Si hay 200, imprime el BODY COMPLETO del stream (para fijar el formato
 *       exacto de los enlaces que trae la API).
 *
 * Uso: node test_cf_pelisgo5.js matrix cmml17hn5032kk4uxzol036iq
 * Sale: consola + pelisgo_confirmacion.txt
 */
'use strict';

const fs = require('fs');

const slug = (process.argv[2] || 'matrix').trim();
const movieIdArg = (process.argv[3] || '').trim();
const BASE = (process.env.PELISGO_BASE || 'https://pelisgo.online').replace(/\/+$/, '');
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

function extraerToken(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.sid === 'string' && data.sid) return data.sid;
  if (typeof data.sessionId === 'string' && data.sessionId) return data.sessionId;
  if (typeof data.token === 'string' && data.token) return data.token;
  return '';
}

(async () => {
  let movieId = movieIdArg;
  const resultados = { syncs: {}, streams: {}, ok: false };

  try {
    /* [0] movieId */
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

  let token = '';
  try {
    /* [1] POST /api/session/sync — el handshake del sitio */
    sep('1', 'POST /api/session/sync (handshake de sesion del sitio)');
    const variantesSync = [
      ['A como el navegador (con cookies)', { ...BROWSER, Accept: '*/*', 'Content-Type': 'application/json', Origin: BASE, Referer: PAGE_URL, Cookie: cookieHeader(), 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' }],
      ['B pelada (como el provider en TV, sin cookies)', { 'User-Agent': UA, Accept: '*/*', 'Content-Type': 'application/json', Origin: BASE, Referer: BASE + '/' }],
    ];
    for (const [etiqueta, headers] of variantesSync) {
      try {
        const r = await fetchTo(BASE + '/api/session/sync', { method: 'POST', headers });
        const sc = takeCookies(r);
        const b = await r.text();
        const tok = extraerToken(safeJson(b));
        resultados.syncs[etiqueta.split(' ')[0]] = { status: r.status, token: tok ? 'sí (len ' + tok.length + ')' : 'no', setCookie: sc.map(c => c.split('=')[0]) };
        line(etiqueta + ' -> ' + r.status + (sc.length ? '  set-cookie: ' + sc.map(c => c.split('=')[0]).join(', ') : ''));
        line('   body: ' + clip(b, 800));
        if (tok && !token) token = tok;
      } catch (e) { line(etiqueta + ' -> ERROR ' + e.message); }
    }
    line('token elegido: ' + (token ? '[len ' + token.length + '] inicia "' + clip(token, 12) + '..."' : '(NINGUNO)'));
  } catch (e) { line('ERROR fase 1: ' + e.message); }

  function safeJson(txt) { try { return JSON.parse(txt); } catch (e) { return null; } }

  try {
    /* [2] stream con x-session-id */
    sep('2', 'GET /api/movies/' + (movieId || '???') + '/stream con x-session-id');
    if (!movieId) {
      line('(sin movieId, se omite)');
    } else if (!token) {
      line('(sin token, se omite)');
    } else {
      const url = BASE + '/api/movies/' + movieId + '/stream';
      const variantes = [
        ['V1 completa (cookies + sec-fetch)', { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(), 'x-session-id': token, 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' }, 3000],
        ['V2 MINIMA (solo UA+Accept+Referer+token)', { 'User-Agent': UA, Accept: 'application/json', Referer: PAGE_URL, 'x-session-id': token }, 1200],
        ['V3 repetida de V1 (token reutilizable?)', { ...BROWSER, Accept: 'application/json', Referer: PAGE_URL, Origin: BASE, Cookie: cookieHeader(), 'x-session-id': token, 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' }, 3000],
      ];
      let primerBody = '';
      for (const [etiqueta, headers, clipN] of variantes) {
        try {
          const r = await fetchTo(url, { headers });
          const sc = takeCookies(r);
          const b = await r.text();
          const esPrimera = etiqueta.startsWith('V1');
          resultados.streams[etiqueta.split(' ')[0]] = { status: r.status, bytes: b.length };
          line(etiqueta + ' -> ' + r.status + (sc.length ? '  set-cookie: ' + sc.map(c => c.split('=')[0]).join(', ') : ''));
          line('   body: ' + clip(b, esPrimera ? 4000 : 400));
          if (esPrimera) primerBody = b;
          if (r.status === 200) resultados.ok = true;
        } catch (e) { line(etiqueta + ' -> ERROR ' + e.message); }
      }
      if (primerBody && resultados.ok) {
        sep('2b', 'BODY COMPLETO del stream (formato real de la API)');
        out(primerBody.slice(0, 6000));
      }
    }
  } catch (e) { line('ERROR fase 2: ' + e.message); }

  /* ---------- resumen ---------- */
  console.log('\n' + '='.repeat(56));
  out('RESUMEN (pega esto en el chat):');
  out(JSON.stringify({
    slug,
    movieId,
    sync: resultados.syncs,
    stream: resultados.streams,
    tokenLen: token.length,
    ok: resultados.ok,
    veredicto: resultados.ok
      ? 'LA API FUNCIONA CON x-session-id -> provider v1.3 listo para probar en Nuvio'
      : 'revisar: ' + JSON.stringify(resultados),
    detalle: 'pelisgo_confirmacion.txt',
  }));
  try { fs.writeFileSync('pelisgo_confirmacion.txt', informe.join('\n') + '\n'); console.log('\nDetalle completo en pelisgo_confirmacion.txt (misma carpeta).'); } catch (e) {}
})().catch(e => { console.log('ERROR fatal: ' + (e && e.message)); }); 
