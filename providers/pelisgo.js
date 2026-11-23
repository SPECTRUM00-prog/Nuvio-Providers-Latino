/**
 * Provider: PelisGO (Películas y Series)
 * Dominio: https://pelisgo.online
 * Arquitectura: Next.js App Router + API REST Interna (/api/movies y /api/series)
 * Resolvers: KeKi (HLS Directo), Flix (GoodStream POST /dl), Magi (Filemoon), Directo (mp4)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / Android TV / FireTV / Desktop)
 *
 * Cambios v1.3-NUVIOTV (2026-11) - se descifra el 403 {"error":"Sesion no valida o
 * expirada"} de la API interna (no era Cloudflare: era sesion de la app). Auditoria
 * de los chunks JS del propio sitio (modulo webpack 98641): el frontend llama a
 * getAntiBotToken() -> POST /api/session/sync (Content-Type: application/json, sin
 * body) y el campo sid|sessionId|token de la respuesta viaja como header
 * "x-session-id" en CADA llamada a /api/movies|series/.../stream (cache 10 min).
 *  1) BOOTSTRAP DE SESION en la capa runtime (ensureSessionToken): replica ese
 *     handshake sin tocar el scraping. Se resetea en cada getStreams, se cachea
 *     entre candidatos y se regenera UNA sola vez si la API responde 403 con el
 *     token puesto (por si expiro entre medias).
 *  2) PARSEO FLEXIBLE del JSON de streams: v1.2 solo leia streamJson.links;
 *     v1.3 acepta links/streams/sources/servers/embeds/videos (+ .data anidado)
 *     y items objeto (url|src|link|file|embed|iframe) o string directo.
 *  3) La ruta principal de la pagina (enlaces embebidos) queda intacta: si el
 *     HTML ya trae enlaces, no se toca ni la sesion ni la API.
 *  4) RED DE SEGURIDAD del parseo API: claves/campos extra (items, embedUrl,
 *     streamUrl) y, si el formato real no encaja en ninguna clave conocida,
 *     barrido de URLs sobre el JSON crudo (mismo barrido de la ruta de pagina).
 *     Confirmado en fase 5: POST /api/session/sync -> 200 token len 95 y
 *     GET /api/movies/{id}/stream -> 200 con x-session-id (body ~3.8 KB).
 *
 * Cambios v1.1-NUVIOTV (2026-11) - capa runtime portada de pelispedia v1.1-NUVIOTV /
 * hackstore v2.3-NUVIOTV / jkanime v2.9 / sololatino v2.0 / cinecalidad v2.4-NUVIOTV /
 * animeav1 v1.2-NUVIOTV (mismo patron ya verificado en TV).
 *  1) FIX CRITICO DE TV: el QuickJS de NuvioTV (dokar quickjs-kt + polyfill de
 *     PluginRuntime.kt) NO define setTimeout/clearTimeout. La v1.0 los usaba sin
 *     condicion dentro de fetchWithTimeout -> el executor de la promesa lanzaba
 *     TypeError al instante, TODA la cadena rechazaba y getStreams devolvia []
 *     SOLO en TV (en PC/Hermes funcionaba). Ahora HAS_TIMER detecta el runtime:
 *     si hay timer (Hermes movil / PC / Node) se conserva el timeout por llamada;
 *     si no hay (TV) fetch directo con el limite real de OkHttp (30s connect /
 *     30s read).
 *  2) PRESUPUESTO GLOBAL Date.now() de 45s (el runtime mata el plugin a los 60s):
 *     cada fetch verifica tvRemaining() y se cancela con null si queda < 400ms;
 *     y en TV el probe m3u8 solo corre si quedan >= 25s de presupuesto.
 *  3) PUENTE __native_fetch (NuvioTV 1.1.1): fetch(url, options || {}) y
 *     try/catch sincrono; fallos de red resuelven null (no rechazan) y todos
 *     los call sites toleran null.
 *  4) TIMEOUT TAMBIEN SOBRE EL CUERPO: textWithTimeout / jsonWithTimeout.
 *  5) DIAGNOSTICO por console.error + CONTRATO GARANTIZADO: getStreams SIEMPRE
 *     devuelve una Promesa que resuelve a Array.
 *
 * Cambios v1.2-NUVIOTV (2026-11) - fix bloqueo Cloudflare en /api/* (reportado por
 * el runner de escritorio: paginas /movies y /search responden 200 pero
 * /api/movies/{id}/stream devuelve 403 "Performing security verification"):
 *  1) ENLACES DESDE LA PAGINA (ruta principal): las paginas pasan Cloudflare y la
 *     API no, asi que los enlaces se extraen del propio HTML de /movies|/series
 *     (bloque JSON "links":[...] con extraccion de corchetes balanceados sobre el
 *     payload des-escapado, + barrido de URLs goodstream/filemoon/.m3u8/.mp4 con
 *     deduplicacion). La API interna queda SOLO como fallback.
 *  2) API FALLBACK ENDURECIDA: cabeceras de navegador real (sec-fetch-*,
 *     sec-ch-ua, Accept-Language y Accept comodino), cookies capturadas de la respuesta
 *     de pagina reenviadas a la API (defensivo: si el puente no expone
 *     res.headers se ignora), y deteccion del body del challenge -> logDiag claro
 *     "API bloqueada por challenge de Cloudflare" en vez de fallo silencioso.
 *  3) FIX regex movieId/episodeId: la clase [^"\\s] excluye la letra "s" y
 *     truncaba IDs CUID que la contienen (los IDs reales son tipo cmm...) ->
 *     ahora [^"\\] (corta solo en comilla o backslash).
 *  4) Nuevo resolver passthrough para .mp4 directo (enlaces embebidos en pagina).
 *  5) LOGICA DE SCRAPING v1.0 intacta en lo demás: busqueda /search?q= multi-query
 *     con scoring (umbral 35), resolvers KeKi / Flix (POST /dl + unpacker Dean
 *     Edwards) / Magi (Filemoon) y probe de calidad m3u8.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 3200;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. CAPA DE EJECUCION (HERMES / QUICKJS / NUVIOTV SAFE)
// En NuvioTV (QuickJS) NO existe setTimeout: OkHttp ya corta cada peticion
// (30s connect / 30s read) y el runtime mata el plugin a los 60s.
// ==========================================

var HAS_TIMER = (typeof setTimeout === "function");
var GLOBAL_BUDGET_MS = 45000;
var START_TS = 0;

// Cookies capturadas de la primera respuesta que las traiga (v1.2, se resetean
// en cada getStreams). Solo se usan para el fallback de la API.
var PAGE_COOKIES = "";

// Sesion interna de pelisgo (v1.3): el "anti-bot token" que el sitio genera con
// POST /api/session/sync y envia como header x-session-id en /api/*/stream.
// Se resetea en cada getStreams y se cachea durante la llamada (expira en 9 min;
// el sitio usa 10). No se toca si la pagina ya trajo enlaces embebidos.
var SESSION_TOKEN = "";
var SESSION_EXPIRES = 0;

var LOG_TAG = "[PelisGO][v1.3]";

function tvNow() {
    try { return Date.now(); } catch (e2) { return 0; }
}

function tvElapsed() {
    if (!START_TS) return 0;
    return tvNow() - START_TS;
}

function tvRemaining() {
    var left = GLOBAL_BUDGET_MS - tvElapsed();
    return (left > 0) ? left : 0;
}

function logDiag(msg) {
    try { console.error(LOG_TAG + " " + msg); } catch (eLog) {}
}

function textWithTimeout(res, timeoutMs) {
    if (!res || typeof res.text !== "function") return Promise.resolve(null);
    if (!HAS_TIMER) {
        try {
            return res.text().then(function(t) { return t; }).catch(function() { return null; });
        } catch (e3) {
            return Promise.resolve(null);
        }
    }
    var limit = timeoutMs || 3000;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.text().then(function(t) {
                if (!done) { done = true; clearTimeout(timer); resolve(t); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
    });
}

function jsonWithTimeout(res, timeoutMs) {
    if (!res || typeof res.json !== "function") return Promise.resolve(null);
    if (!HAS_TIMER) {
        try {
            return res.json().then(function(j) { return j; }).catch(function() { return null; });
        } catch (e4) {
            return Promise.resolve(null);
        }
    }
    var limit = timeoutMs || 3000;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.json().then(function(j) {
                if (!done) { done = true; clearTimeout(timer); resolve(j); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
    });
}

function fetchWithTimeout(url, options, timeoutMs) {
    if (tvRemaining() < 400) {
        logDiag("presupuesto agotado, fetch cancelado: " + url);
        return Promise.resolve(null);
    }

    var fetchPromise = null;
    try {
        fetchPromise = fetch(url, options || {});
        if (!fetchPromise || typeof fetchPromise.then !== "function") {
            fetchPromise = Promise.reject(new Error("fetch sin promesa"));
        }
    } catch (eSync) {
        return Promise.resolve(null);
    }

    if (!HAS_TIMER) {
        // NuvioTV: sin timer JS posible. OkHttp (30s/30s) es el limite real.
        return fetchPromise
            .then(function(res) { return res; })
            .catch(function() { return null; });
    }

    var limit = timeoutMs || NETWORK_TIMEOUT;
    if (limit > tvRemaining()) limit = tvRemaining();
    var timer = null;

    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error("Timeout"));
        }, limit);
    });

    return Promise.race([fetchPromise, timeoutPromise])
        .then(function(res) {
            if (timer) clearTimeout(timer);
            return res;
        })
        .catch(function() {
            if (timer) clearTimeout(timer);
            return null;
        });
}

function captureCookies(res) {
    if (PAGE_COOKIES) return;
    try {
        if (!res || !res.headers) return;
        var pairs = [];
        if (typeof res.headers.getSetCookie === "function") {
            var arr = res.headers.getSetCookie();
            for (var i = 0; i < arr.length; i++) {
                var nv = String(arr[i] || "").split(";")[0];
                if (nv && nv.indexOf("=") !== -1) pairs.push(nv);
            }
        }
        if (pairs.length === 0 && typeof res.headers.get === "function") {
            var raw = String(res.headers.get("set-cookie") || "");
            if (raw) {
                // Cortar por coma solo cuando empieza un nuevo par nombre=valor
                var chunks = raw.split(/,(?=[A-Za-z0-9_.-]+=[A-Za-z0-9_.\-\/+~]*)/);
                for (var c = 0; c < chunks.length; c++) {
                    var nv2 = chunks[c].split(";")[0].trim();
                    if (nv2 && nv2.indexOf("=") !== -1) pairs.push(nv2);
                }
            }
        }
        if (pairs.length > 0) {
            PAGE_COOKIES = pairs.join("; ");
            logDiag("cookies capturadas: " + pairs.length);
        }
    } catch (eCk) {}
}

function buildApiHeaders(pageUrl) {
    var h = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Language": "es-MX,es;q=0.9",
        "Referer": pageUrl,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "sec-ch-ua": "\"Chromium\";v=\"122\", \"Google Chrome\";v=\"122\", \"Not:A-Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\""
    };
    if (PAGE_COOKIES) h["Cookie"] = PAGE_COOKIES;
    return h;
}

// ==========================================
// 1a-bis. SESION INTERNA DE PELISGO (v1.3)
// Replica EXACTA de getAntiBotToken() del sitio (modulo webpack 98641):
//   POST /api/session/sync  Content-Type: application/json  (sin body)
//   -> JSON con sid | sessionId | token
//   -> se envia como header "x-session-id" en /api/movies|series/.../stream
// El sitio cachea 10 min; aqui 9 min de margen y solo dentro de un getStreams.
// ==========================================

function ensureSessionToken(force) {
    if (!force && SESSION_TOKEN && tvNow() < SESSION_EXPIRES) {
        return Promise.resolve(SESSION_TOKEN);
    }

    var opts = {
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Content-Type": "application/json",
            "Origin": BASE_URL,
            "Referer": BASE_URL + "/"
        }
    };
    if (PAGE_COOKIES) opts.headers["Cookie"] = PAGE_COOKIES;

    return fetchWithTimeout(BASE_URL + "/api/session/sync", opts, NETWORK_TIMEOUT)
        .then(function(res) {
            if (!res || !res.ok) {
                logDiag("session/sync HTTP " + (res ? res.status : "null"));
                return "";
            }
            captureCookies(res);
            return jsonWithTimeout(res, 3000);
        })
        .then(function(data) {
            var tok = "";
            if (data && typeof data === "object") {
                if (typeof data.sid === "string" && data.sid) tok = data.sid;
                else if (typeof data.sessionId === "string" && data.sessionId) tok = data.sessionId;
                else if (typeof data.token === "string" && data.token) tok = data.token;
            }
            if (tok) {
                SESSION_TOKEN = tok;
                SESSION_EXPIRES = tvNow() + 9 * 60 * 1000;
                logDiag("sesion creada (len " + tok.length + ")");
            } else {
                logDiag("session/sync sin token usable en la respuesta");
            }
            return tok;
        })
        .catch(function(eSync) {
            logDiag("session/sync fallo: " + (eSync && eSync.message ? eSync.message : eSync));
            return "";
        });
}

// v1.3: normaliza cualquier forma del JSON de streams de la API a la lista de
// enlaces que consumen los resolvers. Acepta array directo, objeto con una de
// las claves conocidas, o {data:{...}} anidado; items objeto (url|src|link|
// file|embed|iframe) o string "https://...".
function normalizeApiLinks(json) {
    if (!json) return [];
    var arr = null;
    if (Array.isArray(json)) {
        arr = json;
    } else if (typeof json === "object") {
        var keys = ["links", "streams", "sources", "servers", "embeds", "videos", "videoServers", "results", "items"];
        for (var k = 0; k < keys.length; k++) {
            var cand = json[keys[k]];
            if (cand && typeof cand === "object" && typeof cand.length === "number" && cand.length > 0) {
                arr = cand;
                break;
            }
        }
        if (!arr && json.data) return normalizeApiLinks(json.data);
    }
    if (!arr) return [];

    var out = [];
    for (var i = 0; i < arr.length && out.length < 16; i++) {
        var it = arr[i];
        var u = "";
        var q = "", lang = "", srv = "";
        if (typeof it === "string") {
            u = it;
        } else if (it && typeof it === "object") {
            u = it.url || it.src || it.link || it.file || it.embed || it.iframe || it.embedUrl || it.streamUrl || "";
            q = (typeof it.quality === "string" && it.quality) || "";
            lang = (typeof it.language === "string" && it.language) || (typeof it.lang === "string" && it.lang) || "";
            srv = (typeof it.server === "string" && it.server) || (typeof it.name === "string" && it.name) || (typeof it.title === "string" && it.title) || "";
        }
        if (u && typeof u === "string" && u.indexOf("http") === 0) {
            out.push({ url: u, quality: q, language: lang, server: srv });
        }
    }
    return out;
}

// ==========================================
// 1b. HELPERS DE STRINGS (HERMES SAFE)
// ==========================================

function cleanTitle(str) {
    if (!str) return "";
    var normalized = str;
    try {
        // QuickJS/entornos reducidos pueden no traer String.prototype.normalize
        normalized = str.normalize("NFD");
    } catch (eNorm) {}
    return normalized
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanSlug(slug) {
    if (!slug) return "";
    return slug.replace(/\/$/, "").split("/").pop().toLowerCase().replace(/-/g, " ");
}

function scoreCandidate(candidateSlug, titles, year) {
    if (!candidateSlug) return 0;
    var cleanS = cleanSlug(candidateSlug);
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        if (cleanS === t || cleanS.indexOf(t) === 0) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (cleanS.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0 && matches > 0) {
            var ratio = (matches / words.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && year && cleanS.indexOf(String(year)) !== -1) {
        score += 15;
    }

    return score;
}

// ==========================================
// 2. DESEMPAQUETADOR DEAN EDWARDS
// ==========================================

function unpackJS(packed) {
    try {
        var regex = /eval\(function\(p,a,c,k,e,[r|d|a-z]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        var match = packed.match(regex);
        if (!match) return null;

        var p = match[1].slice(1, -1);
        var a = match[2];
        var k = match[4];
        var words = k.split("|");
        var radix = parseInt(a, 10);

        var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var unbase = function(val, base) {
            if (base <= 36) return parseInt(val, base);
            var res = 0;
            for (var i = 0; i < val.length; i++) {
                res = res * base + dict.indexOf(val[i]);
            }
            return res;
        };

        return p.replace(/\b[0-9a-zA-Z]+\b/g, function(token) {
            var idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch (e) {
        return null;
    }
}

// ==========================================
// 3. DETECCIÓN DINÁMICA DE CALIDAD REAL
// ==========================================

function probeM3u8Quality(m3u8Url, headers) {
    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    if (!HAS_TIMER && tvRemaining() < 25000) {
        // NuvioTV: el probe corre SIN cancelacion JS (no hay timer) y OkHttp tarda
        // hasta 30s en cortar una lectura colgada. Se lanza solo si quedan >= 25s
        // de presupuesto, con margen frente al kill del runtime (60s).
        // Si no: calidad por defecto.
        logDiag("presupuesto insuficiente para probe m3u8 (" + tvRemaining() + "ms), calidad por defecto");
        return Promise.resolve("720p");
    }

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2000)
    .then(function(res) {
        if (!res || !res.ok) return "720p";
        return textWithTimeout(res, 2500);
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            if (/1080/i.test(m3u8Url)) return "1080p";
            if (/720/i.test(m3u8Url)) return "720p";
            return "720p";
        }

        var maxH = 0;
        var resRegex = /RESOLUTION=\d+x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var h = parseInt(match[1], 10);
            if (h > maxH) maxH = h;
        }

        if (maxH >= 2160) return "4K";
        if (maxH >= 1080) return "1080p";
        if (maxH >= 720) return "720p";
        if (maxH >= 480) return "480p";
        return "720p";
    })
    .catch(function() {
        return "720p";
    });
}

// ==========================================
// 3b. EXTRACCION DE ENLACES DESDE LA PAGINA (v1.2 - RUTA PRINCIPAL)
// Las paginas /movies y /series pasan Cloudflare mientras la API interna
// responde 403 (challenge). Los enlaces se sacan del propio HTML: bloque
// JSON "links":[...] (__NEXT_DATA__ / payload RSC, des-escapado) + barrido
// de URLs de embeds conocidos con deduplicacion.
// ==========================================

function flattenEscapedHtml(html) {
    return String(html)
        .replace(/\\u002f/gi, "/")
        .replace(/\\u0022/gi, "\"")
        .replace(/\\\//g, "/")
        .replace(/\\"/g, "\"");
}

function extractJsonArrayBlock(flat, key) {
    var marker = "\"" + key + "\":[";
    var idx = flat.indexOf(marker);
    if (idx === -1) {
        marker = "\"" + key + "\": [";
        idx = flat.indexOf(marker);
        if (idx === -1) return null;
    }
    var start = flat.indexOf("[", idx);
    if (start === -1) return null;

    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = start; i < flat.length && i < start + 80000; i++) {
        var ch = flat.charAt(i);
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === "\\") { esc = true; continue; }
            if (ch === "\"") inStr = false;
            continue;
        }
        if (ch === "\"") { inStr = true; continue; }
        if (ch === "[") depth++;
        else if (ch === "]") {
            depth--;
            if (depth === 0) return flat.slice(start, i + 1);
        }
    }
    return null;
}

function parseLinksJson(flat) {
    var out = [];
    var keys = ["links", "streams", "embeds", "servers", "sources"];
    for (var k = 0; k < keys.length; k++) {
        var block = extractJsonArrayBlock(flat, keys[k]);
        if (!block) continue;
        try {
            var arr = JSON.parse(block);
            if (arr && arr.length) {
                for (var i = 0; i < arr.length; i++) {
                    var it = arr[i];
                    var u = it && (it.url || it.link || it.file || it.src);
                    if (u && typeof u === "string" && u.indexOf("http") === 0) {
                        out.push({
                            url: u,
                            quality: (typeof it.quality === "string" && it.quality) || "",
                            language: (typeof it.language === "string" && it.language) || (typeof it.lang === "string" && it.lang) || "",
                            server: (typeof it.server === "string" && it.server) || (typeof it.name === "string" && it.name) || ""
                        });
                    }
                }
            }
        } catch (eJson) {}
    }
    return out;
}

function sweepEmbedUrls(flat) {
    var out = [];
    var seen = {};
    var sources = [
        /https?:\/\/[^\s"'<>\\]{6,300}\.m3u8(?:\?[^\s"'<>\\]*)?/gi,
        /https?:\/\/[^\s"'<>\\]*goodstream[^\s"'<>\\]*\/(?:e|v|f|d)\/[a-z0-9]{3,48}/gi,
        /https?:\/\/[^\s"'<>\\]*(?:filemoon|moonplayer)[^\s"'<>\\]*\/(?:e|v|f|d)\/[a-z0-9]{3,48}/gi,
        /https?:\/\/[^\s"'<>\\]{6,300}\.mp4(?:\?[^\s"'<>\\]*)?/gi
    ];
    for (var p = 0; p < sources.length; p++) {
        var re = new RegExp(sources[p].source, "gi");
        var m;
        while ((m = re.exec(flat)) !== null) {
            var u = m[0];
            if (u && !seen[u]) {
                seen[u] = 1;
                out.push({ url: u, quality: "", language: "", server: "" });
            }
            if (out.length >= 16) return out;
        }
    }
    return out;
}

function extractLinksFromPageHtml(html) {
    if (!html || html.length < 20) return [];
    var flat = flattenEscapedHtml(html);
    var found = parseLinksJson(flat);
    var swept = sweepEmbedUrls(flat);

    var seen = {};
    var out = [];
    function push(link) {
        if (!link || !link.url || typeof link.url !== "string") return;
        if (link.url.indexOf("http") !== 0) return;
        if (seen[link.url]) return;
        seen[link.url] = 1;
        if (out.length < 16) out.push(link);
    }
    for (var j = 0; j < found.length; j++) push(found[j]);
    for (var s = 0; s < swept.length; s++) push(swept[s]);
    return out;
}

// ==========================================
// 4. RESOLVERS DE STREAMING (PROMISES)
// ==========================================

// Flix (GoodStream): Envía el POST a /dl con file_code
function resolveGoodStream(url) {
    var fileCodeMatch = url.match(/\/e\/([a-zA-Z0-9]+)/i);
    var fileCode = fileCodeMatch ? fileCodeMatch[1] : "";
    if (!fileCode) return Promise.resolve(null);

    var postUrl = "https://goodstream.one/dl";
    var postBody = "op=embed&file_code=" + encodeURIComponent(fileCode) + "&auto=1&referer=" + encodeURIComponent(BASE_URL + "/");

    return fetchWithTimeout(postUrl, {
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": url,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: postBody
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) return null;
        return textWithTimeout(res, 3000);
    })
    .then(function(html) {
        if (!html) return null;
        if (html.indexOf("File is no longer available") !== -1 || html.indexOf("deleted") !== -1) {
            return null;
        }

        var unpacked = unpackJS(html);
        var sourceText = unpacked || html;
        var m3u8Match = sourceText.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                        sourceText.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);

        if (m3u8Match) {
            var streamUrl = (m3u8Match[1] || m3u8Match[0]).replace(/\\/g, "");
            var headers = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    server: "Flix",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

// Filemoon (Magi): Fallback estándar
function resolveFilemoon(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) return null;
        return textWithTimeout(res, 3000);
    })
    .then(function(html) {
        if (!html) return null;
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) {
            var streamUrl = direct[1].replace(/\\/g, "");
            var headers = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return { url: streamUrl, quality: q || "1080p", server: "Filemoon", headers: headers };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchLinkResolver(item) {
    if (!item || !item.url) return Promise.resolve(null);
    var u = item.url.toLowerCase();
    var sName = (item.server || item.name || "").toLowerCase();

    // 1. KeKi: Stream directo .m3u8
    if (u.indexOf(".m3u8") !== -1) {
        var headers = { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" };
        return probeM3u8Quality(item.url, headers).then(function(q) {
            return {
                url: item.url,
                quality: q || item.quality || "1080p",
                server: "KeKi",
                headers: headers
            };
        });
    }

    // 2. Flix (GoodStream con POST)
    if (sName.indexOf("flix") !== -1 || u.indexOf("goodstream") !== -1) {
        return resolveGoodStream(item.url);
    }

    // 3. Magi (Filemoon)
    if (sName.indexOf("magi") !== -1 || u.indexOf("filemoon") !== -1) {
        return resolveFilemoon(item.url);
    }

    // 4. MP4 directo (enlaces embebidos en pagina, v1.2)
    if (/\.mp4(\?|$)/.test(u)) {
        return Promise.resolve({
            url: item.url,
            quality: item.quality || "1080p",
            server: "Directo",
            headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
        });
    }

    return Promise.resolve(null);
}

// ==========================================
// 5. TMDB METADATA
// ==========================================

function getMediaData(tmdbId, mediaType) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(url, {}, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB HTTP " + (res ? res.status : "null"));
            return jsonWithTimeout(res, 3000);
        })
        .then(function(data) {
            if (!data) return null;

            var titles = [];
            if (data.title) titles.push(data.title);
            if (data.name) titles.push(data.name);
            if (data.original_title) titles.push(data.original_title);
            if (data.original_name) titles.push(data.original_name);

            var altArr = (data.alternative_titles && (data.alternative_titles.results || data.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title) titles.push(altArr[i].title);
            }

            var uniqueTitles = [];
            for (var t = 0; t < titles.length; t++) {
                if (titles[t] && uniqueTitles.indexOf(titles[t]) === -1) {
                    uniqueTitles.push(titles[t]);
                }
            }

            logDiag("TMDB ok: '" + (isTv ? data.name : data.title || "?") + "' (" + ((data.release_date || data.first_air_date || "").substring(0, 4)) + ") timer=" + HAS_TIMER);

            return {
                title: isTv ? data.name : data.title,
                titles: uniqueTitles,
                year: (data.release_date || data.first_air_date || "").substring(0, 4)
            };
        })
        .catch(function(eTmdb) {
            logDiag("TMDB fallo: " + (eTmdb && eTmdb.message ? eTmdb.message : eTmdb));
            return null;
        });
}

// ==========================================
// 6. BÚSQUEDA Y EXTRACCIÓN DE ENLACES
// ==========================================

function searchPelisGO(query, isTv) {
    if (!query) return Promise.resolve([]);
    var searchUrl = BASE_URL + "/search?q=" + encodeURIComponent(query);

    return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
        .then(function(res) {
            if (res && res.ok) captureCookies(res);
            return res && res.ok ? textWithTimeout(res, 3000) : "";
        })
        .then(function(html) {
            if (!html) html = "";
            var linkPattern = isTv ? /href=["'](\/series\/[^"'\s<>]+)["']/gi : /href=["'](\/movies\/[^"'\s<>]+)["']/gi;
            var slugs = [];
            var m;
            while ((m = linkPattern.exec(html)) !== null) {
                var path = m[1].replace("/movies/", "").replace("/series/", "").replace(/\/$/, "");
                if (path && slugs.indexOf(path) === -1) {
                    slugs.push(path);
                }
            }
            return slugs;
        })
        .catch(function() { return []; });
}

function searchMultiQuery(queries, isTv) {
    function tryNext(idx) {
        if (idx >= queries.length) return Promise.resolve([]);
        return searchPelisGO(queries[idx], isTv).then(function(results) {
            if (results && results.length > 0) return results;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

// ==========================================
// 7. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return Promise.resolve([]);

    var isTv = mediaType === "tv" || mediaType === "series";
    var s = parseInt(seasonNum || 1, 10);
    var e = parseInt(episodeNum || 1, 10);

    return getMediaData(tmdbId, mediaType).then(function(media) {
        if (!media || !media.titles || media.titles.length === 0) return [];

        var searchQueries = [];
        for (var i = 0; i < media.titles.length; i++) {
            var raw = media.titles[i];
            var clean = cleanTitle(raw);
            if (clean && searchQueries.indexOf(clean) === -1) searchQueries.push(clean);

            var words = clean.split(/\s+/).filter(function(w) { return w.length > 2; });
            if (words.length >= 2) {
                var shortQ = words.slice(0, 2).join(" ");
                if (searchQueries.indexOf(shortQ) === -1) searchQueries.push(shortQ);
            }
        }

        return searchMultiQuery(searchQueries, isTv).then(function(slugs) {
            if (!slugs || slugs.length === 0) {
                logDiag("busqueda sin resultados (" + Math.round(tvElapsed()) + "ms)");
                return [];
            }

            var scoredCandidates = [];
            for (var u = 0; u < slugs.length; u++) {
                var sc = scoreCandidate(slugs[u], media.titles, media.year);
                if (sc >= 35) {
                    scoredCandidates.push({ slug: slugs[u], score: sc });
                }
            }

            if (scoredCandidates.length === 0) {
                logDiag("sin candidatos validos tras scoring");
                return [];
            }

            scoredCandidates.sort(function(a, b) { return b.score - a.score; });
            logDiag("busqueda: " + slugs.length + " slugs, " + scoredCandidates.length + " validos (" + Math.round(tvElapsed()) + "ms)");

            function tryCandidates(cIdx) {
                if (cIdx >= scoredCandidates.length) return Promise.resolve([]);
                var currentSlug = scoredCandidates[cIdx].slug;
                logDiag("candidato " + (cIdx + 1) + "/" + scoredCandidates.length + ": " + currentSlug + " (" + Math.round(tvElapsed()) + "ms)");

                var pageUrl = isTv ?
                    (BASE_URL + "/series/" + currentSlug + "/temporada/" + s + "/episodio/" + e) :
                    (BASE_URL + "/movies/" + currentSlug);

                return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
                    .then(function(res) {
                        if (!res || !res.ok) return null;
                        captureCookies(res);
                        return textWithTimeout(res, 3000);
                    })
                    .then(function(html) {
                        if (!html) return null;

                        // v1.2/v1.3 - RUTA PRINCIPAL: enlaces embebidos en la pagina.
                        // Si el HTML ya trae enlaces no se toca ni la sesion ni la API.
                        var pageLinks = extractLinksFromPageHtml(html);
                        if (pageLinks && pageLinks.length > 0) {
                            logDiag("pagina: " + pageLinks.length + " enlaces embebidos (" + Math.round(tvElapsed()) + "ms)");
                            return pageLinks;
                        }

                        var idMatch = isTv ?
                            (html.match(/\\?"episodeId\\?"\s*:\s*\\?"([^"\\]+)\\?"/i) || html.match(/episodeId\s*:\s*["']([^"']+)["']/i)) :
                            (html.match(/\\?"movieId\\?"\s*:\s*\\?"([^"\\]+)\\?"/i) || html.match(/movieId\s*:\s*["']([^"']+)["']/i));

                        var entityId = idMatch ? idMatch[1] : null;
                        if (!entityId) {
                            logDiag("sin enlaces embebidos ni id interno en la pagina");
                            return null;
                        }

                        var streamApi = isTv ?
                            (BASE_URL + "/api/series/episode/" + entityId + "/stream") :
                            (BASE_URL + "/api/movies/" + entityId + "/stream");

                        // v1.3 - FALLBACK: la API exige sesion. Bootstrap de
                        // x-session-id (POST /api/session/sync) + cabeceras de
                        // navegador real + cookies de pagina. Si el token que
                        // teniamos fue rechazado (403), se regenera UNA vez.
                        function callStreamApi(tok) {
                            var headers = buildApiHeaders(pageUrl);
                            if (tok) headers["x-session-id"] = tok;
                            return fetchWithTimeout(streamApi, { headers: headers }, NETWORK_TIMEOUT)
                                .then(function(r) {
                                    if (!r || !r.ok) {
                                        logDiag("API HTTP " + (r ? r.status : "null") + ((r && r.status === 403) ? " (sesion rechazada)" : ""));
                                        return { status: r ? r.status : 0, body: null };
                                    }
                                    captureCookies(r);
                                    return textWithTimeout(r, 3000).then(function(body) {
                                        return { status: r.status, body: body };
                                    });
                                });
                        }

                        return ensureSessionToken(false).then(function(tok) {
                            return callStreamApi(tok).then(function(first) {
                                if (first.body) return first.body;
                                if (first.status === 403 && tok) {
                                    logDiag("regenerando sesion y reintentando API");
                                    return ensureSessionToken(true).then(function(tok2) {
                                        if (!tok2 || tok2 === tok) return null;
                                        return callStreamApi(tok2).then(function(second) { return second.body; });
                                    });
                                }
                                return null;
                            });
                        }).then(function(body) {
                            if (!body) return null;
                            var head = body.slice(0, 4000);
                            if (head.indexOf("Just a moment") !== -1 ||
                                head.indexOf("Performing security verification") !== -1 ||
                                head.indexOf("Attention Required") !== -1 ||
                                head.indexOf("cf-chl") !== -1) {
                                logDiag("API bloqueada por challenge de Cloudflare (body detectado)");
                                return null;
                            }
                            if (head.indexOf("lida o expirada") !== -1) {
                                logDiag("API rechazo la sesion (x-session-id invalido)");
                                return null;
                            }
                            try {
                                var streamJson = JSON.parse(body);
                                var norm = normalizeApiLinks(streamJson);
                                if (norm.length === 0) {
                                    // v1.3 ultima red: barrido de URLs sobre el JSON
                                    // crudo por si el formato real usa otras claves.
                                    norm = sweepEmbedUrls(body);
                                    if (norm.length === 0) logDiag("API JSON sin enlaces reconocidos");
                                }
                                return norm.length > 0 ? norm : null;
                            } catch (eJson) {
                                logDiag("API respondio sin JSON valido");
                                return null;
                            }
                        });
                    })
                    .then(function(links) {
                        if (!links || links.length === 0) {
                            return tryCandidates(cIdx + 1);
                        }
                        logDiag("resolviendo " + links.length + " enlaces (" + Math.round(tvElapsed()) + "ms)");

                        var resolvePromises = links.map(function(item) {
                            return dispatchLinkResolver(item).then(function(res) {
                                logDiag("resolver " + (item.server || item.name || "?") + "/" + (item.language || "?") + " -> " + (res && res.url ? "OK" : "null") + " (" + Math.round(tvElapsed()) + "ms)");
                                if (res && res.url) {
                                    return {
                                        name: "PelisGO",
                                        title: (res.quality || item.quality || "1080p") + " · " + (item.language || "Latino") + " · " + res.server,
                                        url: res.url,
                                        quality: res.quality || item.quality || "1080p",
                                        headers: res.headers || { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
                                    };
                                }
                                return null;
                            });
                        });

                        return Promise.all(resolvePromises).then(function(results) {
                            var streams = [];
                            for (var r = 0; r < results.length; r++) {
                                if (results[r]) streams.push(results[r]);
                            }
                            if (streams.length > 0) {
                                logDiag("total " + streams.length + " streams (" + Math.round(tvElapsed()) + "ms)");
                                return streams;
                            }
                            return tryCandidates(cIdx + 1);
                        });
                    });
            }

            return tryCandidates(0);
        });
    }).catch(function(eStage) {
        logDiag("fallo de etapa: " + (eStage && eStage.message ? eStage.message : eStage));
        return [];
    });
}

// Contrato: getStreams SIEMPRE devuelve una Promesa que resuelve a un Array.
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        START_TS = tvNow();
        PAGE_COOKIES = "";
        // v1.3: sesion fresca por llamada (se cachea dentro del getStreams
        // entre candidatos y se regenera ante 403).
        SESSION_TOKEN = "";
        SESSION_EXPIRES = 0;
        logDiag("getStreams tmdbId=" + tmdbId + " type=" + mediaType + " s=" + seasonNum + " e=" + episodeNum);
        if (!tmdbId) return Promise.resolve([]);
        return getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum);
    } catch (eSync) {
        logDiag("excepcion sincrona: " + (eSync && eSync.message ? eSync.message : eSync));
        return Promise.resolve([]);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
}
