/**
 * Provider: TubePelis (Películas en Latino/Español — StreamWish/Byse + Dood)
 * Dominio: https://www.tubepelis.com
 * Motor:   100% Cadenas de Promesas (Hermes / QuickJS / NuvioTV Firestick Safe)
 *
 * ARQUITECTURA (reverse verificado en sandbox, 2026-11):
 *  - Catálogo: películas (sitemap con 3702 entradas /pelicula/); sin sección de
 *    series verificable. Para TV se intenta la misma búsqueda por título.
 *  - Búsqueda REAL (verificada): GET /ajax_search.php?q=<título> -> JSON
 *    [{id, title, url, poster, year}]. (El ?s= del theme NO filtra: es la lista
 *    de recientes; el ?q= de /buscar/ redirige a /saga/.)
 *  - Ficha de película: /pelicula/<id>/<slug>.html contiene N servidores como
 *      reproductor.php?v=<base64>  ->  decodifica a la URL del embed real
 *      (ej. https://byseqekaho.com/e/<code>/ , https://doodstream.com/e/<id>).
 *      NO hace falta pedir reproductor.php: el base64 se decodifica en local.
 *  - SERVIDOR PRINCIPAL "Byse" (byseqekaho.com y frame interno n1mwq.org):
 *      API pública del player (fork con JW Player):
 *        1) POST /api/videos/<code>/embed/captcha  {fingerprint}
 *           -> { pow_nonce, pow_difficulty(16), pow_token, algorithm:
 *                "sha256-leading-zero-bits" }
 *        2) Prueba de trabajo LOCAL: solución = contador s (decimal) tal que el
 *           hash CUSTOM del player (mezcla ChaCha de 4 palabras + tabla de 512,
 *           ~24k ops) de gr(nonce + ":" + s) tenga >= pow_difficulty bits cero.
 *           (El algoritmo NO es SHA-256 real: es el hash propio del frontend,
 *           replicado byte a byte del bundle. Regla 5: 100% bitwise ES5.)
 *        3) POST /api/videos/<code>/embed/captcha/verify {pow_token, solution}
 *           -> { status:"ok", token }  (token válido 1800 s y REUTILIZABLE entre
 *              videos: se cachea a nivel de módulo; el POW solo se paga la
 *              primera vez cada ~30 min de sesión).
 *        4) POST /api/videos/<code>/embed/playback {fingerprint} +
 *           header X-Captcha-Token -> { playback: { version, key_parts[30],
 *           iv, payload } }  blob AES-256-GCM.
 *        5) Clave: base64url-decode(key_parts[version-1]) ++ decode(key_parts[30-version])
 *           = 32 bytes. payload = ciphertext || tag(16). Descifrado AES-256-GCM
 *           implementado en ES5 puro (S-box + expansión de clave + bloque + CTR;
 *           el tag GCM se valida implícitamente al parsear el JSON resultante).
 *           -> { sources: [{url, mime_type, height, label, bitrate_kbps}] }
 *      Verificado end-to-end: master.m3u8 1080p (h=1080) reproducible (HTTP 200).
 *  - DoodStream (doodstream.com y familia): resolver clásico (página /e/ ->
 *    pass_md5 -> URL CDN + token). Aislado; algunos hosts Dood bloquean IPs de
 *    datacenter (403 aquí) pero responden desde IP residencial (Fire TV).
 *  - playmogo.com: protegido con challenge Cloudflare activo — DESCARTADO por
 *    decisión del usuario (no se pelea con Cloudflare).
 *  - Cualquier otro host (StreamWish/VidHide/Filemoon si aparecen): resolver
 *    genérico con unpacker Dean Edwards ES5 y saltos de iframe (Regla 8).
 *
 * Reglas: ES5 estricto (var, funciones, cadenas de promesas), cero dependencias,
 * cero APIs de navegador/Nodo, fetchWithTimeout 2800 ms que nunca rechaza,
 * bodyWithTimeout en toda lectura, isResOk 200-299, deadline 10000 ms que SOLO
 * acota la fase profunda (POW/playback/sondas), tope ~1 MB por respuesta,
 * TMDB normalización con umbral 35 (Regla 6), calidad real (Regla 7),
 * resolvers aislados .catch -> null y dedupe por URL (Regla 8).
 *
 *  ⚠ NuvioTV: cada vez que cambie este archivo hay que SUBIR el campo "version"
 *    de manifest.json (NuvioTV cachea el bytecode QuickJS por versión).
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://www.tubepelis.com";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;      // Regla 4 (valor JKAnime, Firestick OK)
var GLOBAL_DEADLINE_MS = 10000;  // Regla 4: presupuesto SOLO de la fase profunda
var HLS_PROBE_TIMEOUT = 2500;
var MAX_HLS_PROBES = 2;
var MAX_BODY_CHARS = 1000000;    // Regla 4: tope ~1 MB por respuesta
var MAX_SERVERS = 3;             // embeds a resolver por llamada
var MAX_GENERIC_IFRAMES = 2;     // saltos de iframe del resolver genérico

// Byse: presupuesto propio para el POW (dentro del deadline global).
var POW_MAX_MS = 7000;          // tope duro del bucle POW
var POW_DIFF_MAX = 24;           // dificultad por encima => imposible en ES5, saltar
var POW_CHUNK = 512;             // revisa reloj cada N iteraciones

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

// Cache de módulo: token captcha Byse reutilizable entre llamadas (1800 s).
var BYSE_TOKEN_CACHE = { token: "", expiresAt: 0 };

// ==========================================
// 1. HELPERS DE RED (HERMES / TV SAFE — capa SoloLatino v1.3 / JKAnime)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    var timer = null;

    var timeoutPromise = new Promise(function (_, reject) {
        timer = setTimeout(function () {
            reject(new Error("Timeout " + limit + "ms"));
        }, limit);
    });

    var fetchPromise;
    try {
        fetchPromise = fetch(url, options || {});
    } catch (eSync) {
        if (timer) clearTimeout(timer);
        return Promise.resolve(null);
    }

    return Promise.race([fetchPromise, timeoutPromise])
        .then(function (res) {
            if (timer) clearTimeout(timer);
            return res;
        })
        .catch(function () {
            if (timer) clearTimeout(timer);
            return null;
        });
}

function bodyWithTimeout(res, method, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return new Promise(function (resolve) {
        var settled = false;
        var timer = setTimeout(function () {
            if (!settled) { settled = true; resolve(null); }
        }, limit);
        try {
            res[method]().then(function (data) {
                if (!settled) { settled = true; clearTimeout(timer); resolve(data); }
            }).catch(function () {
                if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
            });
        } catch (e) {
            if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
        }
    });
}

function textWithTimeout(res, timeoutMs) {
    return bodyWithTimeout(res, "text", timeoutMs).then(function (txt) {
        if (typeof txt === "string" && txt.length > MAX_BODY_CHARS) {
            return txt.slice(0, MAX_BODY_CHARS);
        }
        return txt;
    });
}

function jsonWithTimeout(res, timeoutMs) {
    return bodyWithTimeout(res, "json", timeoutMs);
}

function isResOk(res) {
    return !!res && (res.ok === true || (typeof res.status === "number" && res.status >= 200 && res.status < 300));
}

function ctxTimeLeft(ctx) {
    if (!ctx || !ctx.deadline) return 60000;
    return ctx.deadline - Date.now();
}

function toAbsolute(href, base) {
    if (!href) return "";
    var h = String(href).replace(/^\s+|\s+$/g, "");
    if (h.indexOf("https://") === 0 || h.indexOf("http://") === 0) return h;
    if (h.indexOf("//") === 0) return "https:" + h;
    if (h.indexOf("/") === 0) return base + h;
    return base + "/" + h;
}

function hostOf(url) {
    var m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);
    return m ? m[1].toLowerCase() : "";
}

function originOf(url) {
    var m = String(url || "").match(/^(https?:\/\/[^\/?#]+)/i);
    return m ? m[1] : "";
}

// ==========================================
// 2. BASE64 / BASE64URL (ES5 puro, sin atob — Regla 2)
// ==========================================

var B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64Decode(input) {
    try {
        var s = String(input || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4 !== 0) s += "=";
        var out = [];
        var bits = 0, acc = 0, count = 0;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (ch === "=") break;
            var v = B64_ALPHABET.indexOf(ch);
            if (v < 0) return "";
            acc = (acc << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out[count++] = (acc >> bits) & 0xff;
            }
        }
        return out;
    } catch (e) {
        return [];
    }
}

function utf8Decode(bytes) {
    try {
        var out = "";
        var i = 0;
        while (i < bytes.length) {
            var b = bytes[i];
            if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
            else if (b >= 0xc0 && b < 0xe0) {
                out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
                i += 2;
            } else if (b >= 0xe0 && b < 0xf0) {
                out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
                i += 3;
            } else if (b >= 0xf0 && b < 0xf8) {
                var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
                cp -= 0x10000;
                out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
                i += 4;
            } else { out += "?"; i += 1; }
        }
        return out;
    } catch (e) {
        return "";
    }
}

// ==========================================
// 3. HASH CUSTOM "BYSE" (mezcla ChaCha + tabla 512) — ES5 bitwise puro (Regla 5)
//    Replicado del bundle videoPagesBundle del player; el servidor lo recalcula
//    para validar la prueba de trabajo.
// ==========================================

function imul32(a, b) {
    if (typeof Math.imul === "function") return Math.imul(a, b) >>> 0;
    // fallback bit a bit (patrón SoloLatino fnv1aHash)
    return (((a & 0xffff) * (b & 0xffff)) + (((b >>> 16) * (a & 0xffff)) << 16)) >>> 0;
}

function rotl32(x, n) {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}

// Math.clz32 no es ES5: implementación manual segura.
function clz32u(x) {
    x = x >>> 0;
    if (x === 0) return 32;
    var n = 0;
    if ((x & 0xffff0000) === 0) { n += 16; x = (x << 16) >>> 0; }
    if ((x & 0xff000000) === 0) { n += 8; x = (x << 8) >>> 0; }
    if ((x & 0xf0000000) === 0) { n += 4; x = (x << 4) >>> 0; }
    if ((x & 0xc0000000) === 0) { n += 2; x = (x << 2) >>> 0; }
    if ((x & 0x80000000) === 0) { n += 1; }
    return n;
}

// gr() del frontend: entrada bytes ASCII, salida 8 palabras.
// VERSIÓN OPTIMIZADA PARA QUICKJS: quarter-rounds, rotl e imul completamente
// inline (cero llamadas a función en el camino caliente), arrays de scratch a
// nivel de módulo. Produce EXACTAMENTE el mismo resultado que el bundle
// original (validado contra la solución del servidor: status "ok").
var _byseE = [0, 0, 0, 0];
var _byseR = new Array(512);

function byseHash(inputBytes) {
    var e = _byseE, r = _byseR;
    e[0] = 1779033703; e[1] = 3144134277; e[2] = 1013904242; e[3] = 2773480762;

    var x0, x1, x2, x3, i, c, s;

    // absorción del input + 8 rondas QR
    for (i = 0; i < inputBytes.length; i++) {
        e[0] = (e[0] + inputBytes[i]) >>> 0;
        e[0] = ((e[0] << 7) | (e[0] >>> 25)) >>> 0;
        x0 = (e[0] + e[1]) >>> 0; x3 = ((e[3] ^ x0) << 16 | (e[3] ^ x0) >>> 16) >>> 0;
        x2 = (e[2] + x3) >>> 0; x1 = ((e[1] ^ x2) << 12 | (e[1] ^ x2) >>> 20) >>> 0;
        x0 = (x0 + x1) >>> 0; e[3] = ((x3 ^ x0) << 8 | (x3 ^ x0) >>> 24) >>> 0;
        x2 = (x2 + e[3]) >>> 0; e[1] = ((x1 ^ x2) << 7 | (x1 ^ x2) >>> 25) >>> 0;
        e[0] = x0; e[2] = x2;
    }
    for (i = 0; i < 8; i++) {
        x0 = (e[0] + e[1]) >>> 0; x3 = ((e[3] ^ x0) << 16 | (e[3] ^ x0) >>> 16) >>> 0;
        x2 = (e[2] + x3) >>> 0; x1 = ((e[1] ^ x2) << 12 | (e[1] ^ x2) >>> 20) >>> 0;
        x0 = (x0 + x1) >>> 0; e[3] = ((x3 ^ x0) << 8 | (x3 ^ x0) >>> 24) >>> 0;
        x2 = (x2 + e[3]) >>> 0; e[1] = ((x1 ^ x2) << 7 | (x1 ^ x2) >>> 25) >>> 0;
        e[0] = x0; e[2] = x2;
    }

    // tabla de 512 entradas
    for (i = 0; i < 512; i++) {
        x0 = (e[0] + e[1]) >>> 0; x3 = ((e[3] ^ x0) << 16 | (e[3] ^ x0) >>> 16) >>> 0;
        x2 = (e[2] + x3) >>> 0; x1 = ((e[1] ^ x2) << 12 | (e[1] ^ x2) >>> 20) >>> 0;
        x0 = (x0 + x1) >>> 0; e[3] = ((x3 ^ x0) << 8 | (x3 ^ x0) >>> 24) >>> 0;
        x2 = (x2 + e[3]) >>> 0; e[1] = ((x1 ^ x2) << 7 | (x1 ^ x2) >>> 25) >>> 0;
        e[0] = x0; e[2] = x2;
        r[i] = (e[0] ^ e[2]) >>> 0;
    }

    // 2 pasadas de mezcla sobre la tabla
    for (var p = 0; p < 2; p++) {
        for (s = 0; s < 512; s++) {
            c = (r[s] + r[r[s] & 511]) >>> 0;
            c = ((c << 13) | (c >>> 19)) >>> 0;
            c = (c ^ Math.imul(r[(s + 1) & 511], 2654435761)) >>> 0;
            r[s] = c;
            e[0] = (e[0] ^ c) >>> 0;
            x0 = (e[0] + e[1]) >>> 0; x3 = ((e[3] ^ x0) << 16 | (e[3] ^ x0) >>> 16) >>> 0;
            x2 = (e[2] + x3) >>> 0; x1 = ((e[1] ^ x2) << 12 | (e[1] ^ x2) >>> 20) >>> 0;
            x0 = (x0 + x1) >>> 0; e[3] = ((x3 ^ x0) << 8 | (x3 ^ x0) >>> 24) >>> 0;
            x2 = (x2 + e[3]) >>> 0; e[1] = ((x1 ^ x2) << 7 | (x1 ^ x2) >>> 25) >>> 0;
            e[0] = x0; e[2] = x2;
        }
    }

    // salida: 8 palabras
    var n0, n1, n2, n3, n4, n5, n6, n7, v, a2, d;
    for (var j = 0; j < 8; j++) {
        x0 = (e[0] + e[1]) >>> 0; x3 = ((e[3] ^ x0) << 16 | (e[3] ^ x0) >>> 16) >>> 0;
        x2 = (e[2] + x3) >>> 0; x1 = ((e[1] ^ x2) << 12 | (e[1] ^ x2) >>> 20) >>> 0;
        x0 = (x0 + x1) >>> 0; e[3] = ((x3 ^ x0) << 8 | (x3 ^ x0) >>> 24) >>> 0;
        x2 = (x2 + e[3]) >>> 0; e[1] = ((x1 ^ x2) << 7 | (x1 ^ x2) >>> 25) >>> 0;
        e[0] = x0; e[2] = x2;
        v = e[0];
        a2 = j * 64;
        for (c = 0; c < 64; c++) {
            d = r[a2 + c];
            v = (v + d) >>> 0;
            v = ((v << 5) | (v >>> 27)) >>> 0;
            v = (v ^ Math.imul(d, 2246822519)) >>> 0;
        }
        var wj = (v ^ e[2]) >>> 0;
        if (j === 0) n0 = wj; else if (j === 1) n1 = wj; else if (j === 2) n2 = wj;
        else if (j === 3) n3 = wj; else if (j === 4) n4 = wj; else if (j === 5) n5 = wj;
        else if (j === 6) n6 = wj; else n7 = wj;
    }
    return [n0, n1, n2, n3, n4, n5, n6, n7];
}

// Shim ES5 para Math.imul (Hermes/QuickJS lo traen, pero el fallback garantiza
// exactitud bitwise en cualquier motor; se instala UNA vez al cargar).
if (typeof Math.imul !== "function") {
    Math.imul = function (a, b) {
        var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
        return ((al * bl) + (((ah * bl + al * bh) & 0xffff) << 16)) >>> 0;
    };
}

function byseLeadZeroBits(words) {
    var z = 0;
    for (var r = 0; r < words.length; r++) {
        var w = words[r];
        if (w === 0) { z += 32; continue; }
        return z + clz32u(w);
    }
    return z;
}

function byseBytesOf(str) {
    var out = new Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
    return out;
}

// Prueba de trabajo: solución = contador decimal con >= difficulty bits cero.
// Optimizada: buffer de bytes preasignado (sin realocar por iteración) y check
// de la PRIMERA palabra (difficulty <= 32 siempre cae ahí). Presupuesto de tiempo
// duro; devuelve null si no llegó (Regla 8: aislado).
function solveBysePow(nonce, difficulty, budgetMs) {
    if (!difficulty || difficulty <= 0) return "0";
    if (difficulty > POW_DIFF_MAX) return null;
    var start = Date.now();
    var nonceStr = String(nonce);
    var buf = [];
    var i;
    for (i = 0; i < nonceStr.length; i++) buf.push(nonceStr.charCodeAt(i) & 255);
    buf.push(58); // ':'
    var fixedLen = buf.length;
    for (var k = 0; k < 12; k++) buf.push(48); // hueco para el contador
    var s = 0;
    for (;;) {
        for (var c = 0; c < POW_CHUNK; c++) {
            var numStr = "" + s;
            var len = fixedLen + numStr.length;
            for (i = 0; i < numStr.length; i++) buf[fixedLen + i] = numStr.charCodeAt(i);
            buf.length = len;
            var w0 = byseHash(buf)[0];
            var bits = (w0 === 0) ? 32 : clz32u(w0);
            if (bits >= difficulty) return numStr;
            s++;
        }
        if (Date.now() - start > budgetMs) return null;
    }
}

// ==========================================
// 4. AES-256-GCM DESCIFRADO — ES5 puro (Regla 5). Solo se necesita la dirección
//    de cifrado del bloque (modo contador); el tag GCM no se verifica: el
//    JSON.parse del resultado actúa de validación (tolerancia Regla 8).
// ==========================================

var AES_SBOX = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
];

var AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

// Expansión de clave AES (Nk=4/6/8 según longitud; aquí siempre AES-256).
function aes256ExpandKey(keyBytes) {
    var Nk = keyBytes.length / 4;
    var Nr = Nk + 6;
    var total = 4 * (Nr + 1);
    var w = new Array(total);
    var i;
    for (i = 0; i < Nk; i++) {
        w[i] = [(keyBytes[4 * i] & 0xff), (keyBytes[4 * i + 1] & 0xff), (keyBytes[4 * i + 2] & 0xff), (keyBytes[4 * i + 3] & 0xff)];
    }
    for (i = Nk; i < total; i++) {
        var temp = [w[i - 1][0], w[i - 1][1], w[i - 1][2], w[i - 1][3]];
        if (i % Nk === 0) {
            // RotWord + SubWord + Rcon
            var t0 = temp[0];
            temp[0] = AES_SBOX[temp[1]];
            temp[1] = AES_SBOX[temp[2]];
            temp[2] = AES_SBOX[temp[3]];
            temp[3] = AES_SBOX[t0];
            temp[0] = (temp[0] ^ AES_RCON[(i / Nk) - 1]) & 0xff;
        } else if (Nk > 6 && i % Nk === 4) {
            temp[0] = AES_SBOX[temp[0]];
            temp[1] = AES_SBOX[temp[1]];
            temp[2] = AES_SBOX[temp[2]];
            temp[3] = AES_SBOX[temp[3]];
        }
        w[i] = [
            (w[i - Nk][0] ^ temp[0]) & 0xff,
            (w[i - Nk][1] ^ temp[1]) & 0xff,
            (w[i - Nk][2] ^ temp[2]) & 0xff,
            (w[i - Nk][3] ^ temp[3]) & 0xff
        ];
    }
    // Nr real para el bloque (el llamante usa este bloque con clave 256)
    return { words: w, nr: Nr };
}

// Cifra un bloque de 16 bytes con las round keys (dirección de cifrado — la que
// usa GCM en modo contador también para descifrar).
function xtime(a) {
    var hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi === 0x80) a ^= 0x1b;
    return a & 0xff;
}

function aesEncryptBlockRounds(w, nr, input) {
    var Nr = nr;
    var s = new Array(16);
    var i;
    for (i = 0; i < 16; i++) s[i] = input[i] & 0xff;

    // AddRoundKey(0): palabras w[0..3], columna por columna.
    for (i = 0; i < 16; i++) s[i] = (s[i] ^ w[i >> 2][i & 3]) & 0xff;

    var round;
    for (round = 1; round <= Nr; round++) {
        // SubBytes + ShiftRows (s se recorre por columnas: índice = 4c + r)
        var t = new Array(16);
        for (var c = 0; c < 4; c++) {
            for (var r2 = 0; r2 < 4; r2++) {
                // ShiftRows: fila r se rota r posiciones a la izquierda
                var srcC = (c + r2) % 4;
                t[4 * c + r2] = AES_SBOX[s[4 * srcC + r2]];
            }
        }
        s = t;
        // MixColumns (omitida en la ronda final), DESPUÉS AddRoundKey (FIPS-197)
        if (round !== Nr) {
            for (var col = 0; col < 4; col++) {
                var a0 = s[4 * col], a1 = s[4 * col + 1], a2b = s[4 * col + 2], a3 = s[4 * col + 3];
                var x1 = xtime(a0), x2 = xtime(a1), x3 = xtime(a2b), x4 = xtime(a3);
                s[4 * col] = (x1 ^ (a1 ^ x2) ^ a2b ^ a3) & 0xff;
                s[4 * col + 1] = (a0 ^ x2 ^ (a2b ^ x3) ^ a3) & 0xff;
                s[4 * col + 2] = (a0 ^ a1 ^ x3 ^ (a3 ^ x4)) & 0xff;
                s[4 * col + 3] = ((a0 ^ x1) ^ a1 ^ a2b ^ x4) & 0xff;
            }
        }
        // AddRoundKey(round)
        for (i = 0; i < 16; i++) s[i] = (s[i] ^ w[4 * round + (i >> 2)][i & 3]) & 0xff;
    }
    return s;
}

// Descifra AES-GCM (cualquier tamaño de clave 128/192/256 se mapea por longitud;
// aquí siempre 256). Sin verificación de tag: JSON.parse valida el resultado.
function aesGcmDecryptCtr(keyBytes, ivBytes, payloadBytes) {
    // GCM: payload = ciphertext || tag(16 bytes). Solo interesa el ciphertext.
    if (!payloadBytes || payloadBytes.length <= 16) return "";
    var ct = payloadBytes.slice(0, payloadBytes.length - 16);
    var ek = aes256ExpandKey(keyBytes);
    var w = ek.words, nr = ek.nr;

    // Bloque contador: iv(12) || 00000001; primer bloque de datos = contador 2.
    var out = new Array(ct.length);
    var blockIndex = 2;
    for (var off = 0; off < ct.length; off += 16) {
        var ctr = [
            ivBytes[0], ivBytes[1], ivBytes[2], ivBytes[3],
            ivBytes[4], ivBytes[5], ivBytes[6], ivBytes[7],
            ivBytes[8], ivBytes[9], ivBytes[10], ivBytes[11],
            (blockIndex >>> 24) & 0xff, (blockIndex >>> 16) & 0xff,
            (blockIndex >>> 8) & 0xff, blockIndex & 0xff
        ];
        var ks = aesEncryptBlockRounds(w, nr, ctr);
        var end = Math.min(16, ct.length - off);
        for (var k = 0; k < end; k++) {
            out[off + k] = (ct[off + k] ^ ks[k]) & 0xff;
        }
        blockIndex++;
    }
    return utf8Decode(out);
}

// Descifra el blob playback {version, key_parts, iv, payload} -> JSON object.
function decryptBysePlayback(pb) {
    try {
        if (!pb || !pb.key_parts || !pb.iv || !pb.payload) return null;
        var parts = pb.key_parts;
        var n = parseInt(String(pb.version || "0"), 10) || 0;
        var picks;
        var a = n, b = 31 - n;
        if (n >= 1 && a <= parts.length && b >= 1 && b <= parts.length) {
            picks = [parts[a - 1], parts[b - 1]];
        } else {
            picks = parts;
        }
        var key = [];
        for (var i = 0; i < picks.length; i++) {
            var seg = b64Decode(picks[i]);
            for (var j = 0; j < seg.length; j++) key.push(seg[j]);
        }
        if (key.length !== 16 && key.length !== 24 && key.length !== 32) return null;
        var iv = b64Decode(pb.iv);
        var payload = b64Decode(pb.payload);
        if (!iv.length || !payload.length) return null;
        var plain = aesGcmDecryptCtr(key, iv, payload);
        if (!plain) return null;
        return JSON.parse(plain);
    } catch (e) {
        return null;
    }
}

// ==========================================
// 5. TMDB + BÚSQUEDA + SCORING (Regla 6 — patrón SoloLatino)
// ==========================================

function normalizeSlug(text) {
    if (!text) return "";
    var norm = text;
    try {
        norm = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return norm
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .trim();
}

function cleanText(str) {
    if (!str) return "";
    var norm = str;
    try {
        norm = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return norm.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanSlug(urlOrSlug) {
    if (!urlOrSlug) return "";
    var path = urlOrSlug.replace(/^https?:\/\/[^/]+/i, "");
    path = path.replace(/^\/pelicula\//i, "").replace(/\.html?$/i, "").replace(/\/.*$/, "");
    return cleanText(path);
}

function scoreCandidate(slugOrTitle, titles, year) {
    if (!slugOrTitle) return 0;
    var cleanS = cleanSlug(slugOrTitle);
    if (!cleanS) return 0;

    var slugWords = cleanS.split(/\s+/);
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanText(titles[i]);
        if (!t) continue;

        if (cleanS === t || (year && cleanS === t + " " + String(year))) {
            score = Math.max(score, 100);
            continue;
        }

        if (cleanS.indexOf(t + " ") === 0) {
            score = Math.max(score, 85);
            continue;
        }

        var words = t.split(/\s+/).filter(function (w) { return w.length > 2; });
        var targetWords = words.length > 0 ? words : t.split(/\s+/);
        var matches = 0;

        for (var j = 0; j < targetWords.length; j++) {
            if (slugWords.indexOf(targetWords[j]) !== -1) {
                matches++;
            }
        }

        if (targetWords.length > 0 && matches > 0) {
            var ratio = (matches / targetWords.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    // Regla 6: bonifica el año correcto; penaliza años distintos en el slug.
    if (score > 0 && year) {
        var targetYear = String(year);
        if (slugWords.indexOf(targetYear) !== -1) {
            score += 20;
        } else {
            for (var y = 0; y < slugWords.length; y++) {
                var wY = slugWords[y];
                if (/^(19|20)\d{2}$/.test(wY) && wY !== targetYear) {
                    var titleHasYear = false;
                    for (var ti = 0; ti < titles.length; ti++) {
                        var titleWords = cleanText(titles[ti]).split(/\s+/);
                        if (titleWords.indexOf(wY) !== -1) {
                            titleHasYear = true;
                            break;
                        }
                    }
                    if (!titleHasYear) {
                        score = Math.max(0, score - 25);
                    }
                    break;
                }
            }
        }
    }

    return score;
}

// Búsqueda REAL del sitio (verificada): GET /ajax_search.php?q=<query> ->
// JSON [{id, title, url, poster, year}]. Scoring Regla 6 con umbral 35 sobre
// slug+title y bonificación/penalización por año.
function searchTubepelis(query, titles, year) {
    var searchUrl = BASE_URL + "/ajax_search.php?q=" + encodeURIComponent(query);
    return fetchWithTimeout(searchUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json,text/html,*/*",
            "Referer": BASE_URL + "/",
            "X-Requested-With": "XMLHttpRequest"
        }
    }, NETWORK_TIMEOUT)
        .then(function (res) { return isResOk(res) ? jsonWithTimeout(res) : null; })
        .then(function (data) {
            if (!data || !Array.isArray(data) || data.length === 0) return null;
            var candidates = [];
            var seen = [];
            for (var i = 0; i < data.length && i < 12; i++) {
                var it = data[i];
                if (!it || typeof it.url !== "string") continue;
                var link = toAbsolute(it.url, BASE_URL);
                if (link.indexOf("/pelicula/") === -1 || seen.indexOf(link) !== -1) continue;
                seen.push(link);

                // Regla 6: score sobre slug de la URL y sobre el título del item.
                var sc = Math.max(
                    scoreCandidate(link, titles, year),
                    scoreCandidate(String(it.title || ""), titles, year)
                );
                // Año explícito del catálogo (mejor señal que el slug).
                var itYear = String(it.year || "");
                if (sc > 0 && year && itYear) {
                    if (itYear === String(year)) sc += 20;
                    else sc = Math.max(0, sc - 25);
                }
                if (sc >= 35) candidates.push({ url: link, score: sc });
            }
            if (candidates.length === 0) return null;
            candidates.sort(function (a, b) { return b.score - a.score; });
            return candidates[0].url;
        })
        .catch(function () { return null; });
}

// ==========================================
// 6. EXTRACCIÓN DE SERVIDORES DE LA FICHA
// ==========================================

// reproductor.php?v=<base64> -> URL del embed real (decodificada en local).
function extractEmbedUrls(html) {
    var out = [];
    var seen = [];
    var m;
    var re = /reproductor\.php\?v=([A-Za-z0-9%=_-]{8,400})/gi;
    while ((m = re.exec(html)) !== null && out.length < 8) {
        var b64 = m[1];
        try { b64 = decodeURIComponent(b64); } catch (e) {}
        var bytes = b64Decode(b64);
        var url = bytes.length ? utf8Decode(bytes) : "";
        if (url.indexOf("http") !== 0) continue;
        if (seen.indexOf(url) !== -1) continue;
        seen.push(url);
        out.push(url);
    }
    return out;
}

function classifyServer(url) {
    var host = hostOf(url);
    if (!host) return "skip";
    if (/playmogo/i.test(host)) return "skip";        // Cloudflare activo: descartado
    if (/dood|dsvore|ds2play|dooood|ds2video/i.test(host)) return "dood";
    if (/byse|n1mwq/i.test(host)) return "byse";
    return "generic";                                  // StreamWish/VidHide/Filemoon/otros
}

// ==========================================
// 7. RESOLVER BYSE (captcha POW + playback AES-GCM) — cadena verificada
// ==========================================

function randomHex(n) {
    var chars = "0123456789abcdef";
    var s = "";
    for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * 16));
    return s;
}

function buildFingerprint() {
    var uuid = randomHex(8) + "-" + randomHex(4) + "-" + randomHex(4) + "-" + randomHex(4) + "-" + randomHex(12);
    return {
        token: "tv" + randomHex(16),
        viewer_id: uuid,
        device_id: randomHex(8) + "-" + randomHex(4) + "-" + randomHex(4) + "-" + randomHex(4) + "-" + randomHex(12),
        confidence: 0.95
    };
}

function byseGetJson(apiBase, pathSuffix, refererUrl, timeoutMs) {
    return fetchWithTimeout(apiBase + pathSuffix, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Referer": refererUrl || (apiBase + "/")
        }
    }, timeoutMs || NETWORK_TIMEOUT)
        .then(function (res) {
            if (!isResOk(res)) return null;
            return jsonWithTimeout(res, NETWORK_TIMEOUT);
        })
        .catch(function () { return null; });
}

function bysePostJson(apiBase, pathSuffix, bodyObj, captchaToken, refererUrl, timeoutMs) {
    var headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": apiBase,
        "Referer": refererUrl || (apiBase + "/"),
        "X-Embed-Origin": BASE_URL
    };
    if (captchaToken) headers["X-Captcha-Token"] = captchaToken;
    return fetchWithTimeout(apiBase + pathSuffix, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(bodyObj)
    }, timeoutMs || NETWORK_TIMEOUT)
        .then(function (res) {
            if (!isResOk(res)) return null;
            return jsonWithTimeout(res, NETWORK_TIMEOUT);
        })
        .catch(function () { return null; });
}

// Devuelve Promise<Array<{url, kind, quality, label}>> — aislado (nunca rechaza).
function resolveByse(embedUrl, ctx) {
    var apiBase = originOf(embedUrl);
    var codeMatch = embedUrl.match(/\/e\/([^\/?#]+)/);
    if (!apiBase || !codeMatch) return Promise.resolve([]);
    var code = codeMatch[1];
    var fp = buildFingerprint();
    var apiReferer = apiBase + "/e/" + code + "/";

    // 0) PRE-CHECK barato: GET /embed/details confirma que el registro del video
    //    existe (varios códigos del sitio están muertos: "video record missing").
    //    Si no existe, se descarta SIN pagar captcha+POW (~2-3 s ahorrados).
    var precheck = byseGetJson(apiBase, "/api/videos/" + code + "/embed/details", apiReferer)
        .then(function (meta) { return !!meta && !!meta.code; })
        .catch(function () { return true; }); // si el check falla por red, no bloqueamos

    // 1) ¿Token cacheado? (válido 1800 s, reutilizable entre videos)
    function withToken(token) {
        if (!token) return Promise.resolve([]);
        // 2) playback con X-Captcha-Token
        return bysePostJson(apiBase, "/api/videos/" + code + "/embed/playback",
            { fingerprint: fp }, token, apiReferer)
            .then(function (pj) {
                if (!pj || !pj.playback) return [];
                // 3) descifrado AES-256-GCM local (Regla 5)
                var data = decryptBysePlayback(pj.playback);
                if (!data || !data.sources || data.sources.length === 0) return [];
                var streams = [];
                for (var i = 0; i < data.sources.length && i < 3; i++) {
                    var s = data.sources[i];
                    if (!s || typeof s.url !== "string" || s.url.indexOf("http") !== 0) continue;
                    var isHls = /mpegurl/i.test(String(s.mime_type || "")) || /\.m3u8(\?|#|$)/i.test(s.url);
                    streams.push({
                        url: s.url,
                        kind: isHls ? "hls" : "mp4",
                        quality: s.label || (s.height ? String(s.height) + "p" : ""),
                        height: parseInt(s.height, 10) || 0,
                        label: "Byse"
                    });
                }
                return streams;
            })
            .catch(function () { return []; });
    }

    var cached = BYSE_TOKEN_CACHE;
    if (cached.token && Date.now() < cached.expiresAt) {
        return precheck.then(function (alive) {
            if (!alive) return [];
            return withToken(cached.token);
        }).catch(function () { return []; });
    }

    // 4) captcha -> POW -> verify -> token (con presupuesto duro de tiempo)
    return precheck
        .then(function (alive) {
            if (!alive) return null;
            if (ctxTimeLeft(ctx) < 4000) return null;
            return bysePostJson(apiBase, "/api/videos/" + code + "/embed/captcha",
                { fingerprint: fp }, null, apiReferer)
                .then(function (ch) {
                    if (!ch || !ch.pow_nonce || !ch.pow_token) return null;
                    var budget = Math.min(POW_MAX_MS, ctxTimeLeft(ctx) - 2500);
                    if (budget < 1500) return null;
                    var solution = solveBysePow(ch.pow_nonce, ch.pow_difficulty, budget);
                    if (!solution) return null;
                    return bysePostJson(apiBase, "/api/videos/" + code + "/embed/captcha/verify",
                        { pow_token: ch.pow_token, solution: solution, fingerprint: fp }, null, apiReferer)
                        .then(function (vj) {
                            if (!vj || vj.status !== "ok" || !vj.token) return null;
                            // cachea el token (reutilizable entre videos, Regla de coste)
                            var ttl = typeof vj.expires_in === "number" ? vj.expires_in : 1800;
                            BYSE_TOKEN_CACHE.token = vj.token;
                            BYSE_TOKEN_CACHE.expiresAt = Date.now() + Math.max(300, ttl - 60) * 1000;
                            return vj.token;
                        });
                });
        })
        .then(function (token) {
            return withToken(token);
        })
        .catch(function () { return []; });
}

// ==========================================
// 8. RESOLVER DOODSTREAM (clásico; aislado)
// ==========================================

function randomToken(len) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var s = "";
    for (var i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

// Devuelve {url, kind:"mp4"} o null — aislado (nunca rechaza).
function resolveDood(embedUrl, ctx) {
    if (ctxTimeLeft(ctx) < 2500) return Promise.resolve(null);
    return fetchWithTimeout(embedUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": BASE_URL + "/",
            "Accept": "text/html,*/*;q=0.8"
        },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
        .then(function (res) {
            if (!isResOk(res)) return null;
            var pageUrl = res.url || embedUrl;
            return textWithTimeout(res).then(function (html) {
                if (!html) return null;
                // /pass_md5/<token> aparece en el JS del player dood
                var m = html.match(/pass_md5["']?\s*[:,=]\s*["'](\/pass_md5\/[a-z0-9]+)["']/i) ||
                        html.match(/(["'])(\/pass_md5\/[a-z0-9]+)\1/i);
                if (!m) return null;
                var host = hostOf(pageUrl);
                if (!host) return null;
                var md5Url = "https://" + host + m[2] || m[1];
                if (md5Url.indexOf("/pass_md5/") === -1) return null;
                return fetchWithTimeout(md5Url, {
                    headers: { "User-Agent": USER_AGENT, "Referer": pageUrl },
                    redirect: "follow"
                }, NETWORK_TIMEOUT)
                    .then(function (r2) {
                        if (!isResOk(r2)) return null;
                        return textWithTimeout(r2).then(function (body) {
                            if (!body || body.indexOf("http") !== 0) return null;
                            var tok = randomToken(10);
                            return {
                                url: body + "?token=" + tok + "&expiry=" + tok,
                                kind: "mp4"
                            };
                        });
                    });
            });
        })
        .catch(function () { return null; });
}

// ==========================================
// 9. RESOLVER GENÉRICO DE EMBEDS (Regla 8: unpacker Dean Edwards + iframes)
//    Cubre StreamWish/VidHide/Filemoon o cualquier host nuevo.
// ==========================================

function unescapePayload(raw) {
    return String(raw || "").replace(/\\(.)/g, "$1");
}

function decToken(c, a) {
    var s = "";
    var n = c;
    while (n > 0) {
        var r = n % a;
        s = (r > 35 ? String.fromCharCode(r + 29) : r.toString(36)) + s;
        n = Math.floor(n / a);
    }
    return s === "" ? "0" : s;
}

function unpackOne(payloadRaw, base, count, keysRaw) {
    try {
        var payload = unescapePayload(payloadRaw);
        var keys = unescapePayload(keysRaw).split("|");
        var out = payload;
        for (var i = count - 1; i >= 0; i--) {
            var tok = decToken(i, base);
            if (!tok) continue;
            var rep = (typeof keys[i] === "string" && keys[i] !== "") ? keys[i] : tok;
            if (rep === tok) continue;
            var re = new RegExp("\\b" + tok + "\\b", "g");
            out = out.replace(re, function () { return rep; });
        }
        return out;
    } catch (e) {
        return "";
    }
}

function extractPackedArgs(src, fromPos) {
    try {
        var seg = String(src).slice(fromPos, fromPos + 300000);
        var qi = -1;
        for (var i = 0; i < seg.length && i < 200; i++) {
            var ch = seg.charAt(i);
            if (ch === "'" || ch === '"') { qi = i; break; }
            if (ch === ")") return null;
        }
        if (qi < 0) return null;
        seg = seg.slice(qi);
        var q = seg.charAt(0);
        var cls = "[\\\\" + q + "]";
        var reStr = "^" + q + "((?:\\\\.|" + cls + ")*)" + q +
            "\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*" + q +
            "((?:\\\\.|" + cls + ")*)" + q;
        var m = seg.match(new RegExp(reStr));
        if (!m) return null;
        var base = parseInt(m[2], 10);
        var count = parseInt(m[3], 10);
        if (!isFinite(base) || !isFinite(count) || base < 2 || base > 64 || count < 1 || count > 5000) return null;
        return { payload: m[1], base: base, count: count, keys: m[4] };
    } catch (e) {
        return null;
    }
}

function unpackAll(html) {
    var out = [];
    var marker = "eval(function(p,a,c,k,e,";
    var pos = 0;
    var guard = 0;
    try {
        while (guard < 6) {
            guard++;
            var s = html.indexOf(marker, pos);
            if (s === -1) break;
            var open = html.indexOf("}(", s);
            if (open === -1) break;
            var argsStart = open + 2;
            pos = argsStart;
            var args = extractPackedArgs(html, argsStart);
            if (args) {
                var un = unpackOne(args.payload, args.base, args.count, args.keys);
                if (un) out.push(un);
            }
        }
    } catch (e) {}
    return out.join("\n");
}

function collectFileUrls(hay) {
    var urls = [];
    var m;
    try {
        var re = /(?:file|source)\s*[:=]\s*["']([^"'\s]{12,500})["']/gi;
        while ((m = re.exec(hay)) !== null && urls.length < 24) {
            var u = m[1];
            if (u.charAt(0) === "#" || u.indexOf("data:") === 0) continue;
            if (/\.(m3u8|mp4|(?:master|index|playlist)\.txt)(\?|#|$)/i.test(u) || u.indexOf(".m3u8") !== -1) {
                urls.push(u);
            }
        }
        if (urls.length === 0) {
            var re2 = /["']((?:https?:)?\/\/[^"'\s]{12,500})["']/gi;
            while ((m = re2.exec(hay)) !== null && urls.length < 24) {
                var u2 = m[1];
                if (/\.(m3u8|mp4|(?:master|index|playlist)\.txt)(\?|#|$)/i.test(u2)) {
                    urls.push(u2);
                }
            }
        }
    } catch (e) {}
    return urls;
}

function pickStreamUrl(urls) {
    for (var i = 0; i < urls.length; i++) {
        if (/\.(m3u8|(?:master|index|playlist)\.txt)(\?|#|$)/i.test(urls[i]) || urls[i].indexOf(".m3u8") !== -1) {
            return { url: urls[i], kind: "hls" };
        }
    }
    for (var j = 0; j < urls.length; j++) {
        if (/\.mp4(\?|#|$)/i.test(urls[j])) return { url: urls[j], kind: "mp4" };
    }
    return null;
}

function extractStreamFromHtml(html, pageUrl) {
    if (!html || !pageUrl) return null;
    var hay = html + "\n" + unpackAll(html);
    // protección: si la página es un challenge de Cloudflare, abortar (decisión del usuario)
    if (/Just a moment\.\.\.|challenge-platform|__cf_chl/i.test(hay)) return null;
    var urls = collectFileUrls(hay);
    var picked = pickStreamUrl(urls);
    if (!picked) return null;
    var u = picked.url;
    if (u.indexOf("//") === 0) u = "https:" + u;
    else if (u.indexOf("/") === 0) u = toAbsolute(u, pageUrl);
    if (u.indexOf("http") !== 0) return null;
    return {
        url: u,
        kind: picked.kind,
        headers: { "User-Agent": USER_AGENT, "Referer": pageUrl }
    };
}

// Resuelve cualquier embed al archivo final: unpacker + hasta 2 saltos de iframe.
// Devuelve {url, kind, headers} o null — aislado (nunca rechaza).
function resolveGenericEmbed(embedUrl, referer, ctx) {
    if (ctxTimeLeft(ctx) < 2500) return Promise.resolve(null);

    // Familia StreamWish: /f/ y /v/ son archivos; el embed vive en /e/ (patrón JKAnime)
    var target = embedUrl;
    var tHost = hostOf(target);
    if (/(wish|vibuxer|hglink|hgcloud|flaswish|hlswish)/i.test(tHost) &&
        (target.indexOf("/f/") !== -1 || target.indexOf("/v/") !== -1)) {
        target = target.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    return fetchWithTimeout(target, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": referer || BASE_URL + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
        },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
        .then(function (res) {
            if (!isResOk(res)) return null;
            var pageUrl = res.url || target;
            return textWithTimeout(res).then(function (html) {
                var hit = extractStreamFromHtml(html, pageUrl);
                if (hit) return hit;
                if (ctxTimeLeft(ctx) < 2500) return null;

                var iframeUrls = [];
                var reIframe = /<iframe[^>]+src=["']([^"']+)["']/gi;
                var im;
                while ((im = reIframe.exec(html)) !== null && iframeUrls.length < MAX_GENERIC_IFRAMES) {
                    var abs = toAbsolute(im[1], pageUrl);
                    if (abs && abs.indexOf("http") === 0 && abs !== target && abs !== embedUrl && iframeUrls.indexOf(abs) === -1) {
                        iframeUrls.push(abs);
                    }
                }

                function tryIframe(idx) {
                    if (idx >= iframeUrls.length) return null;
                    if (ctxTimeLeft(ctx) < 2500) return null;
                    return fetchWithTimeout(iframeUrls[idx], {
                        headers: {
                            "User-Agent": USER_AGENT,
                            "Referer": pageUrl,
                            "Accept": "text/html,*/*;q=0.8"
                        },
                        redirect: "follow"
                    }, NETWORK_TIMEOUT)
                        .then(function (res2) {
                            if (!isResOk(res2)) return tryIframe(idx + 1);
                            return textWithTimeout(res2).then(function (html2) {
                                var hit2 = extractStreamFromHtml(html2, res2.url || iframeUrls[idx]);
                                if (hit2) return hit2;
                                return tryIframe(idx + 1);
                            });
                        })
                        .catch(function () { return tryIframe(idx + 1); });
                }

                return tryIframe(0);
            });
        })
        .catch(function () { return null; });
}

// ==========================================
// 10. CALIDAD (Regla 7)
// ==========================================

function classifyResolution(w, h) {
    if (w >= 3840 || h >= 2160) return "4K";
    if (w >= 1920 || h >= 1080) return "1080p";
    if (w >= 1280 || h >= 720) return "720p";
    if (w >= 854 || h >= 480) return "480p";
    return "Auto";
}

function detectQuality(url, label) {
    var cleanUrl = String(url || "").split("?")[0].split("#")[0].toLowerCase();
    var text = cleanUrl + " " + String(label || "").toLowerCase();
    if (text.indexOf(".urlset") !== -1) {
        var m = text.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (m) {
            var tags = m[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("h") !== -1) return "1080p";
            if (tags.indexOf("n") !== -1) return "720p";
            if (tags.indexOf("l") !== -1) return "480p";
        }
    }
    if (text.indexOf("master.m3u8") !== -1) return "1080p";
    if (/(?:^|[^a-z0-9])(?:4k|2160p?)(?:[^a-z0-9]|$)/i.test(text)) return "4K";
    if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(text)) return "1080p";
    if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(text)) return "720p";
    if (/(?:^|[^a-z0-9])480p?(?:[^a-z0-9]|$)/i.test(text)) return "480p";
    return "720p";
}

function probeHlsQuality(url, referer) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": referer || BASE_URL + "/" },
        redirect: "follow"
    }, HLS_PROBE_TIMEOUT)
        .then(function (res) {
            if (!isResOk(res)) return "";
            return textWithTimeout(res, HLS_PROBE_TIMEOUT);
        })
        .then(function (txt) {
            if (!txt) return "";
            var re = /RESOLUTION=(\d+)x(\d+)/gi;
            var bestW = 0;
            var bestH = 0;
            var m;
            while ((m = re.exec(txt)) !== null) {
                var w = parseInt(m[1], 10);
                var h = parseInt(m[2], 10);
                if (w * h > bestW * bestH) {
                    bestW = w;
                    bestH = h;
                }
            }
            if (bestH > 0) return classifyResolution(bestW, bestH);
            return "";
        })
        .catch(function () { return ""; });
}

// ==========================================
// 11. FUNCIÓN PRINCIPAL EXPORTADA (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";

    // Regla 6: sanitizar tmdbId a solo dígitos.
    var tmdbIdStr = String(tmdbId === undefined || tmdbId === null ? "" : tmdbId).replace(/[^0-9]/g, "");
    if (!tmdbIdStr) return Promise.resolve([]);

    var sParsed = parseInt(season, 10);
    var sNum = isNaN(sParsed) ? 1 : sParsed;
    var eParsed = parseInt(episode, 10);
    var eNum = isNaN(eParsed) ? 1 : eParsed;

    var ctx = { deadline: 0, probes: 0 };

    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbIdStr +
        "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, null, 2500)
        .then(function (res) {
            if (!isResOk(res)) throw new Error("TMDB HTTP Error");
            return jsonWithTimeout(res);
        })
        .then(function (meta) {
            if (!meta) throw new Error("TMDB vacio");

            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = ((isMovie ? meta.release_date : meta.first_air_date) || "").slice(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length && i < 6; i++) {
                var altT = altArr[i].title || altArr[i].name;
                if (altT && titles.indexOf(altT) === -1) titles.push(altT);
            }

            // Regla 6: queries de búsqueda. La búsqueda AJAX del sitio es LITERAL
            // (LIKE sobre el título con su puntuación), así que primero se prueba
            // el título crudo tal como lo da TMDB; el fallback recorta a la
            // primera palabra significativa. El scoring (>=35 + año) protege de
            // falsos positivos con queries cortas.
            var queries = [];
            if (title && queries.indexOf(title) === -1) queries.push(title);
            if (origTitle && queries.indexOf(origTitle) === -1) queries.push(origTitle);
            var firstWord = "";
            for (var f = 0; f < titles.length && !firstWord; f++) {
                var parts = cleanText(titles[f]).split(/\s+/);
                for (var p2 = 0; p2 < parts.length; p2++) {
                    if (parts[p2].length >= 3) { firstWord = parts[p2]; break; }
                }
            }
            if (firstWord && queries.indexOf(firstWord) === -1) queries.push(firstWord);
            queries = queries.slice(0, 3);
            if (queries.length === 0) return [];

            function tryQuery(idx) {
                if (idx >= queries.length) return Promise.resolve(null);
                return searchTubepelis(queries[idx], titles, year).then(function (found) {
                    if (found) return found;
                    return tryQuery(idx + 1);
                });
            }

            return tryQuery(0).then(function (pageUrl) {
                if (!pageUrl) return [];
                return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
                    .then(function (res) { return isResOk(res) ? textWithTimeout(res) : ""; })
                    .then(function (html) {
                        if (!html) return [];
                        var servers = extractEmbedUrls(html);
                        if (servers.length === 0) return [];

                        // Orden de prioridad: byse (HLS 1080p con calidad real) ->
                        // dood -> genérico. skip (playmogo/CF) descartado.
                        var byClass = { byse: [], dood: [], generic: [] };
                        for (var k = 0; k < servers.length; k++) {
                            var cls = classifyServer(servers[k]);
                            if (cls !== "skip" && byClass[cls]) byClass[cls].push(servers[k]);
                        }
                        var ordered = byClass.byse.concat(byClass.dood).concat(byClass.generic)
                            .slice(0, MAX_SERVERS);
                        if (ordered.length === 0) return [];

                        // v1.3 (patrón SoloLatino/JKAnime): el deadline SOLO acota
                        // la fase profunda; la cadena principal nunca se corta.
                        ctx.deadline = Date.now() + GLOBAL_DEADLINE_MS;

                        var results = [];
                        var seenUrls = [];

                        function resolveNext(idx) {
                            if (idx >= ordered.length) return Promise.resolve(results);
                            if (ctxTimeLeft(ctx) < 2000) return Promise.resolve(results);
                            var serverUrl = ordered[idx];
                            var cls = classifyServer(serverUrl);

                            var resolveP;
                            if (cls === "byse") {
                                resolveP = resolveByse(serverUrl, ctx);
                            } else if (cls === "dood") {
                                resolveP = resolveDood(serverUrl, ctx).then(function (hit) {
                                    return hit ? [{ url: hit.url, kind: hit.kind, quality: "", height: 0, label: "DoodStream" }] : [];
                                });
                            } else {
                                resolveP = resolveGenericEmbed(serverUrl, pageUrl, ctx).then(function (hit) {
                                    return hit ? [{ url: hit.url, kind: hit.kind, quality: "", height: 0, label: hostOf(serverUrl), headers: hit.headers }] : [];
                                });
                            }

                            return resolveP
                                .then(function (streams) {
                                    function nextServer() { return resolveNext(idx + 1); }
                                    if (!streams || streams.length === 0) return nextServer();

                                    function pushStream(st) {
                                        var targetUrl = st.url;
                                        if (!targetUrl || seenUrls.indexOf(targetUrl) !== -1) return nextServer();
                                        seenUrls.push(targetUrl);

                                        var isMp4 = st.kind === "mp4";
                                        var fallbackQual = st.quality ||
                                            (st.height ? classifyResolution(st.height, st.height) : "") ||
                                            detectQuality(targetUrl, st.label);
                                        var referer = (st.headers && st.headers.Referer) ||
                                            (cls === "byse" ? originOf(serverUrl) + "/" : BASE_URL + "/");

                                        var canProbe = !isMp4 &&
                                            targetUrl.indexOf(".m3u8") !== -1 &&
                                            ctx.probes < MAX_HLS_PROBES &&
                                            ctxTimeLeft(ctx) > 3000;

                                        function pushWith(qual) {
                                            results.push({
                                                name: "Tubepelis",
                                                title: qual + " · " + st.label + (isMp4 ? " (MP4)" : ""),
                                                quality: qual,
                                                url: targetUrl,
                                                headers: {
                                                    "User-Agent": USER_AGENT,
                                                    "Referer": referer
                                                }
                                            });
                                            return nextServer();
                                        }

                                        if (canProbe && !fallbackQual) {
                                            ctx.probes++;
                                            return probeHlsQuality(targetUrl, referer)
                                                .then(function (detected) {
                                                    return pushWith(detected || fallbackQual || "Auto");
                                                });
                                        }
                                        return pushWith(fallbackQual || (isMp4 ? "720p" : "Auto"));
                                    }

                                    // Aislamiento Regla 8: si un stream de la lista
                                    // falla, se continúa con el siguiente servidor.
                                    var chain = Promise.resolve();
                                    streams.forEach(function (st) {
                                        chain = chain.then(function () { return pushStream(st); });
                                    });
                                    return chain;
                                })
                                .catch(function () {
                                    return resolveNext(idx + 1);
                                });
                        }

                        return resolveNext(0);
                    });
            });
        })
        .catch(function () {
            return [];
        });
}

// Forma de export idéntica a JKAnime/SoloLatino (verificada en NuvioTV).
if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
