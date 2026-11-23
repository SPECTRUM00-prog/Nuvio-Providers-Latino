/**
 * Plugin de SoloLatino (Peliculas y Series) para Nuvio Media Hub
 * Motor: Criptografia PoW Dinamica + AES-256-CBC en JS Puro (Zero-Dependencies)
 * Resolvers: VidHide (morencius/acek-cdn), StreamWish (playerwish), Voe, Mixdrop,
 *            MP4Upload, Streamtape, Filemoon + generico para hosts desconocidos
 *
 * Cambios v2.0 (2026-11) - reconstruccion con la logica probada en jkanime v2.9:
 *  1) CAPA RUNTIME ADAPTATIVA (el fix critico de TV): el QuickJS de NuvioTV
 *     (dokar quickjs-kt + polyfill de PluginRuntime.kt) NO define setTimeout/
 *     clearTimeout. La v1.1.1 los usaba sin condition -> cada fetch rechazaba al
 *     instante y el provider devolvia 0 streams SOLO en TV. Ahora: HAS_TIMER
 *     detecta el runtime; si no hay timer (TV) se usa fetch directo con el limite
 *     real de OkHttp (30s/30s) y un presupuesto global Date.now() de 45s; si hay
 *     timer (Hermes movil / PC / Node) se conserva el timeout por llamada.
 *  2) ORDEN DE RUTAS CORREGIDO: pelispedia.mov/vidurl/{clave}/ PRIMERO (responde
 *     200 con dataLink LINK_CHALLENGE hoy) y embed69.org/f/{clave} como respaldo
 *     (403 WAF Anubis a clientes no-navegador; puede volver a servir desde IPs
 *     residenciales). Antes se quemaba 1 peticion 403 por clave.
 *  3) CLAVES TV CORREGIDAS: el mirror indexa episodios como {imdbSerie}-SxEE con
 *     episodio a 2 digitos (verificado: tt3581920-1x01 = 200; tt3581920-1x1,
 *     -s1e01 y el tt del EPISODIO = 404). La v1.1.1 anteponia el tt del episodio
 *     -> nunca acertaba. Orden: serie-s x ee2, serie-s x e, serie plana (ultimo
 *     recurso con aviso de posible episodio por defecto). Se elimino la peticion
 *     a TMDB /season/../episode/external_ids (su tt de episodio no sirve aqui).
 *  4) CALIDAD POR FAMILIA (leccion acek-cdn de jkanime): los m3u8 de VidHide
 *     viven en CDNs ajenos (acek-cdn.com, etc.). Mapa VSW (x/o/h=1080p, n=720p,
 *     l=480p) aplicado a TODA la familia vidhide/streamwish/filemoon + acek-cdn,
 *     en vez del mapa generico que etiquetaba 1080p como 720p.
 *  5) RESOLVERS AMPLIADOS: Mixdrop, MP4Upload, Streamtape y Filemoon (portados
 *     de jkanime v2.9, ya validados en vivo) + resolver generico para hosts
 *     desconocidos (voe, d-s.io...) que busca m3u8/mp4 en HTML crudo y en el
 *     packer desempaquetado. Los hosts de descarga (mediafire/mega/1fichier) se
 *     saltan sin gastar peticiones.
 *  6) DEDUPE por URL exacta + orden final por calidad (1080p primero, desempate
 *     estable por orden de aparicion) - Regla 8.
 *  7) DIAGNOSTICO: todo el rastro va por console.error con tag [SoloLatino][v2.0]
 *     porque NuvioTV/FireOS silencia console.log en release.
 *  8) solvePoW con tope de tiempo (Date.now) para no quemar el presupuesto de
 *     45s si el runtime es lento; parseo tolerante de dataLink si JSON.parse
 *     falla; getStreams garantizado a devolver Promesa -> [] ante cualquier fallo.
 *
 * Herencia v1.1.1 (se conserva):
 *  - fetch(url, options || {}) + try/catch sincrono (puente __native_fetch).
 *  - Timeout tambien sobre el CUERPO (textWithTimeout/jsonWithTimeout).
 *  - Ruta dual de descifrado: LINK_CHALLENGE (sin PoW) y POW_CHALLENGE (PoW
 *    + sha256 del challenge + nonce + salt).
 *  - SHA-256 y AES-256-CBC propios (zero-deps), buffers pre-asignados en la
 *    ruta rapida del PoW y ruta general multi-bloque para challenges largos.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://embed69.org";
var MIRROR_URL = "https://pelispedia.mov";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;

var LOG_TAG = "[SoloLatino][v2.0]";

// ==========================================
// 1. HELPERS DE RED & STRINGS (HERMES / QUICKJS SAFE)
// En NuvioTV (QuickJS) NO existe setTimeout: OkHttp ya corta cada peticion
// (30s connect / 30s read) y el runtime mata el plugin a los 60s.
// ==========================================

var HAS_TIMER = (typeof setTimeout === "function");
var GLOBAL_BUDGET_MS = 45000;
var START_TS = 0;

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

function decodeB64ToBytes(b64) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(b64).replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "").replace(/[=]+$/, "");
    if (str.length % 4 === 1) return new Uint8Array(0);
    var output = [];
    for (var bc = 0, bs = 0, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output.push(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return new Uint8Array(output);
}

function stringToUtf8Bytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 0x80) bytes.push(code);
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else if (code < 0xd800 || code >= 0xe000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        else {
            i++;
            code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return new Uint8Array(bytes);
}

function utf8BytesToString(bytes) {
    var str = "", i = 0;
    while (i < bytes.length) {
        var b1 = bytes[i++];
        if (b1 < 0x80) str += String.fromCharCode(b1);
        else if (b1 > 0xbf && b1 < 0xe0) {
            var b2 = bytes[i++];
            str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
        } else if (b1 > 0xdf && b1 < 0xf0) {
            var b2 = bytes[i++], b3 = bytes[i++];
            str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
        } else {
            var b2 = bytes[i++], b3 = bytes[i++], b4 = bytes[i++];
            var code = (((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)) - 0x10000;
            str += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        }
    }
    return str;
}

function pad2(n) {
    return (n < 10 ? "0" : "") + n;
}

// ==========================================
// 2. MOTOR SHA-256 (COMPRESOR REUTILIZABLE)
// ==========================================

var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

var SHA256_IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function sha256Compress(H, W) {
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (var t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + SHA256_K[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;

        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
}

function sha256Schedule(padded, offset, W) {
    var t, g0, g1;
    for (t = 0; t < 16; t++) W[t] = padded.getUint32(offset + t * 4, false);
    for (t = 16; t < 64; t++) {
        g0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^ ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^ (W[t - 15] >>> 3);
        g1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^ ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + g0 + W[t - 7] + g1) | 0;
    }
}

// Buffers pre-asignados para la ruta rapida del PoW (zero-allocation)
var POW_W = new Uint32Array(64);
var POW_H = [0, 0, 0, 0, 0, 0, 0, 0];
var POW_BUFFER = new Uint8Array(128);
var POW_VIEW = new DataView(POW_BUFFER.buffer);

function powHashMatches(h0, h1, fullBytes, hasHalfByte) {
    if (fullBytes >= 1 && (h0 >>> 24) !== 0) return false;
    if (fullBytes >= 2 && ((h0 >>> 16) & 0xff) !== 0) return false;
    if (fullBytes >= 3 && ((h0 >>> 8) & 0xff) !== 0) return false;
    if (fullBytes >= 4 && (h0 & 0xff) !== 0) return false;
    if (hasHalfByte) {
        var shift = (3 - fullBytes) * 8 + 4;
        var nibble = fullBytes < 4 ? (h0 >>> shift) & 0x0f : (h1 >>> 28);
        if (nibble !== 0) return false;
    }
    return true;
}

function solvePoW(challengeStr, difficulty) {
    var cBytes = stringToUtf8Bytes(challengeStr);
    var cLen = cBytes.length;
    var fullBytes = difficulty >> 1;
    var hasHalfByte = (difficulty & 1) === 1;

    // Tope de tiempo: en runtimes lentos (QuickJS TV) un PoW no puede quemar
    // el presupuesto global de 45s. 4000ms cubre difficulties hasta ~5.
    var powStart = tvNow();
    var POW_DEADLINE_MS = 4000;
    function powOutOfTime() {
        return (tvNow() - powStart) > POW_DEADLINE_MS;
    }

    // Ruta rapida: challenge + nonce caben en un solo bloque SHA-256 (totalLen <= 55)
    if (cLen + 20 <= 55) {
        for (var nonce = 0; nonce < 300000; nonce++) {
            if ((nonce & 4095) === 0 && powOutOfTime()) return -1;

            var n = nonce, nDigits = 0, tempN = n;
            do { nDigits++; tempN = (tempN / 10) | 0; } while (tempN > 0);

            var totalLen = cLen + nDigits;
            POW_BUFFER.fill(0);
            POW_BUFFER.set(cBytes, 0);

            var pos = totalLen - 1;
            tempN = n;
            do {
                POW_BUFFER[pos--] = 48 + (tempN % 10);
                tempN = (tempN / 10) | 0;
            } while (tempN > 0);

            POW_BUFFER[totalLen] = 0x80;
            POW_VIEW.setUint32(60, totalLen * 8, false);

            sha256Schedule(POW_VIEW, 0, POW_W);

            for (var hi = 0; hi < 8; hi++) POW_H[hi] = SHA256_IV[hi];
            sha256Compress(POW_H, POW_W);

            if (powHashMatches(POW_H[0] >>> 0, POW_H[1] >>> 0, fullBytes, hasHalfByte)) return nonce;
        }
        return -1;
    }

    // Ruta general multi-bloque: challenges largos (padding correcto para cualquier longitud)
    for (var nonce2 = 0; nonce2 < 300000; nonce2++) {
        if ((nonce2 & 255) === 0 && powOutOfTime()) return -1;

        var nStr = String(nonce2);
        var nBytes = stringToUtf8Bytes(nStr);
        var totalLen2 = cLen + nBytes.length;

        var bitLen = totalLen2 * 8;
        var newLen = (((totalLen2 + 8) >> 6) + 1) << 6;
        var padded = new Uint8Array(newLen);
        padded.set(cBytes, 0);
        padded.set(nBytes, cLen);
        padded[totalLen2] = 0x80;

        var view = new DataView(padded.buffer);
        view.setUint32(newLen - 4, bitLen, false);

        var H = [SHA256_IV[0], SHA256_IV[1], SHA256_IV[2], SHA256_IV[3], SHA256_IV[4], SHA256_IV[5], SHA256_IV[6], SHA256_IV[7]];
        var W = new Uint32Array(64);

        for (var b = 0; b < newLen; b += 64) {
            sha256Schedule(view, b, W);
            sha256Compress(H, W);
        }

        if (powHashMatches(H[0] >>> 0, H[1] >>> 0, fullBytes, hasHalfByte)) return nonce2;
    }
    return -1;
}

function sha256(input) {
    var bytes = typeof input === "string" ? stringToUtf8Bytes(input) : input;
    var H = [SHA256_IV[0], SHA256_IV[1], SHA256_IV[2], SHA256_IV[3], SHA256_IV[4], SHA256_IV[5], SHA256_IV[6], SHA256_IV[7]];
    var bitLen = bytes.length * 8;
    var newLen = (((bytes.length + 8) >> 6) + 1) << 6;
    var padded = new Uint8Array(newLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    var view = new DataView(padded.buffer);
    view.setUint32(newLen - 4, bitLen, false);
    var W = new Uint32Array(64);

    for (var i = 0; i < newLen; i += 64) {
        sha256Schedule(view, i, W);
        sha256Compress(H, W);
    }

    var out = new Uint8Array(32);
    var outView = new DataView(out.buffer);
    for (var j = 0; j < 8; j++) outView.setUint32(j * 4, H[j], false);
    return out;
}

// ==========================================
// 3. MOTOR AES-256-CBC PURO
// ==========================================

var SBOX = new Uint8Array([
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
]);

var INV_SBOX = new Uint8Array(256);
for (var i0 = 0; i0 < 256; i0++) INV_SBOX[SBOX[i0]] = i0;
var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function gmult(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return p;
}

function keyExpansion256(key) {
    var w = new Uint32Array(60);
    for (var i = 0; i < 8; i++) w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    for (var i2 = 8; i2 < 60; i2++) {
        var temp = w[i2 - 1];
        if (i2 % 8 === 0) {
            temp = (temp << 8) | (temp >>> 24);
            temp = (SBOX[(temp >>> 24) & 0xff] << 24) | (SBOX[(temp >>> 16) & 0xff] << 16) | (SBOX[(temp >>> 8) & 0xff] << 8) | SBOX[temp & 0xff];
            temp ^= RCON[i2 / 8] << 24;
        } else if (i2 % 8 === 4) {
            temp = (SBOX[(temp >>> 24) & 0xff] << 24) | (SBOX[(temp >>> 16) & 0xff] << 16) | (SBOX[(temp >>> 8) & 0xff] << 8) | SBOX[temp & 0xff];
        }
        w[i2] = (w[i2 - 8] ^ temp) >>> 0;
    }
    return w;
}

function invCipherBlock(block, w) {
    var state = new Uint8Array(16);
    state.set(block);
    function addRoundKey(rnd) {
        for (var c = 0; c < 4; c++) {
            var word = w[rnd * 4 + c];
            state[c * 4 + 0] ^= (word >>> 24) & 0xff;
            state[c * 4 + 1] ^= (word >>> 16) & 0xff;
            state[c * 4 + 2] ^= (word >>> 8) & 0xff;
            state[c * 4 + 3] ^= word & 0xff;
        }
    }
    addRoundKey(14);
    for (var round = 13; round >= 1; round--) {
        var t1 = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1;
        var t = state[2]; state[2] = state[10]; state[10] = t;
        t = state[6]; state[6] = state[14]; state[14] = t;
        var t4 = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t4;
        for (var i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
        addRoundKey(round);
        for (var c2 = 0; c2 < 4; c2++) {
            var s0 = state[c2 * 4], s1 = state[c2 * 4 + 1], s2 = state[c2 * 4 + 2], s3 = state[c2 * 4 + 3];
            state[c2 * 4 + 0] = gmult(s0, 0x0e) ^ gmult(s1, 0x0b) ^ gmult(s2, 0x0d) ^ gmult(s3, 0x09);
            state[c2 * 4 + 1] = gmult(s0, 0x09) ^ gmult(s1, 0x0e) ^ gmult(s2, 0x0b) ^ gmult(s3, 0x0d);
            state[c2 * 4 + 2] = gmult(s0, 0x0d) ^ gmult(s1, 0x09) ^ gmult(s2, 0x0e) ^ gmult(s3, 0x0b);
            state[c2 * 4 + 3] = gmult(s0, 0x0b) ^ gmult(s1, 0x0d) ^ gmult(s2, 0x09) ^ gmult(s3, 0x0e);
        }
    }
    var t1f = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1f;
    var tf = state[2]; state[2] = state[10]; state[10] = tf;
    tf = state[6]; state[6] = state[14]; state[14] = tf;
    var t4f = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t4f;
    for (var iF = 0; iF < 16; iF++) state[iF] = INV_SBOX[state[iF]];
    addRoundKey(0);
    return state;
}

function decryptAES(encryptedBase64, aesKeyBytes) {
    try {
        var raw = decodeB64ToBytes(encryptedBase64);
        if (raw.length < 32 || raw.length % 16 !== 0) return null;
        var iv = raw.slice(0, 16);
        var ciphertext = raw.slice(16);
        var w = keyExpansion256(aesKeyBytes);
        var decrypted = new Uint8Array(ciphertext.length);
        for (var i = 0; i < ciphertext.length; i += 16) {
            var block = ciphertext.slice(i, i + 16);
            var invBlock = invCipherBlock(block, w);
            var prevBlock = i === 0 ? iv : ciphertext.slice(i - 16, i);
            for (var j = 0; j < 16; j++) decrypted[i + j] = invBlock[j] ^ prevBlock[j];
        }
        var pad = decrypted[decrypted.length - 1];
        if (pad < 1 || pad > 16) return null;
        for (var k = decrypted.length - pad; k < decrypted.length; k++) {
            if (decrypted[k] !== pad) return null;
        }
        return utf8BytesToString(decrypted.slice(0, decrypted.length - pad));
    } catch (e) {
        return null;
    }
}

// ==========================================
// 4. DESEMPAQUETADOR DEAN EDWARDS (MULTI-BLOQUE)
// ==========================================

function unpackFromHtml(html) {
    if (!html) return "";
    var packRegex = /eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]+\)\{[\s\S]*?\}\((['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\(['"]\|['"]\)/g;
    var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    function decodeBase(val, radix) {
        var res = 0;
        for (var i = 0; i < val.length; i++) {
            var idx = dict.indexOf(val[i]);
            if (idx === -1) return NaN;
            res = res * radix + idx;
        }
        return res;
    }

    var results = [];
    var packMatch;

    while ((packMatch = packRegex.exec(html)) !== null) {
        var p = packMatch[2];
        var a = parseInt(packMatch[3], 10);
        var k = packMatch[6].split("|");

        var unpacked = p.replace(/\b([0-9a-zA-Z]+)\b/g, function(token) {
            var index = decodeBase(token, a);
            if (isNaN(index) || index >= k.length) return token;
            return (k[index] && k[index] !== "") ? k[index] : token;
        });

        results.push(unpacked.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, "/"));
    }

    return results.join("\n");
}

// ==========================================
// 5. DETECCION DINAMICA DE CALIDAD (REGLA 7, MAPA POR FAMILIA)
// ==========================================

function isVswFamilyHost(u) {
    // Familia VidHide/StreamWish/Filemoon: el HLS vive en CDNs que ROTAN
    // (acek-cdn.com, dramiyos-cdn.com, kerapoxy, ...) y por eso no se puede
    // fiar del hostname. Firma ESTRUCTURAL verificada en vivo: la ruta siempre
    // lleva /hls2/, /hls3/, /hls4/ ... y el sufijo _,l,n,h,.urlset con
    // h=1080p (1920x1080 real) / n=720p (1704x720 real) / l=480p.
    if (u.indexOf("/hls") !== -1) return true;
    // Nombres de host conocidos de la familia (embeds, no CDNs).
    return u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1 ||
        u.indexOf("morencius") !== -1 || u.indexOf("callistanise") !== -1 ||
        u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 ||
        u.indexOf("flaswish") !== -1 || u.indexOf("playerwish") !== -1 ||
        u.indexOf("hglink") !== -1 || u.indexOf("hgcloud") !== -1 ||
        u.indexOf("strwish") !== -1 || u.indexOf("hanerix") !== -1 ||
        u.indexOf("vibuxer") !== -1 || u.indexOf("filemoon") !== -1 ||
        u.indexOf("moonplayer") !== -1 || u.indexOf("acek-cdn") !== -1;
}

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();

    if (u.indexOf(".urlset") !== -1) {
        var m = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (m) {
            var tags = m[1].split(",");
            if (isVswFamilyHost(u)) {
                // Mapa de la familia: x/o/h = 1080p, n = 720p, l = 480p
                if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("h") !== -1) return "1080p";
                if (tags.indexOf("n") !== -1) return "720p";
                if (tags.indexOf("l") !== -1) return "480p";
            }
            // Mapa generico fuera de familia
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("fhd") !== -1) return "1080p";
            if (tags.indexOf("h") !== -1 || tags.indexOf("hd") !== -1) return "720p";
            if (tags.indexOf("n") !== -1 || tags.indexOf("sd") !== -1) return "480p";
            if (tags.indexOf("l") !== -1) return "360p";
        }
    }

    var pathOnly = u.split("?")[0].split("#")[0];
    if (/(?:^|[^a-z0-9])(4k|2160p?)(?:[^a-z0-9]|$)/i.test(pathOnly)) return "4K";
    if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "1080p";
    if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "720p";
    if (/(?:^|[^a-z0-9])480p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "480p";
    return null;
}

function probeM3u8Quality(m3u8Url, headers, defaultQuality) {
    var fallback = defaultQuality || "720p";
    var fastQ = detectQualityFromUrl(m3u8Url);
    if (fastQ) return Promise.resolve(fastQ);

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve(fallback);

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2500)
    .then(function(res) {
        if (!res || !res.ok) return fallback;
        return textWithTimeout(res, 2500);
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            if (text && text.indexOf("#EXTM3U") !== -1) return fallback;
            return fallback;
        }
        var maxW = 0, maxH = 0;
        var resRegex = /RESOLUTION=(\d+)x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var w = parseInt(match[1], 10);
            var h = parseInt(match[2], 10);
            if (w > maxW) maxW = w;
            if (h > maxH) maxH = h;
        }
        // Evaluar ANCHO Y ALTO: 1920x804 panoramico = 1080p (Regla 7)
        if (maxW >= 3840 || maxH >= 2160) return "4K";
        if (maxW >= 1920 || maxH >= 1080) return "1080p";
        if (maxW >= 1280 || maxH >= 720) return "720p";
        if (maxW >= 854 || maxH >= 480) return "480p";
        return fallback;
    })
    .catch(function() { return fallback; });
}

// ==========================================
// 6. RESOLVERS DE STREAMING ROBUSTOS
// ==========================================

function resolveVidHide(url) {
    var hostMatch = url.match(/^(https?:\/\/[^/]+)/i);
    var host = hostMatch ? hostMatch[1] : "https://morencius.com";

    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": MIRROR_URL + "/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) {
            logDiag("vidhide: HTTP " + (res ? res.status : "null") + " " + url);
            return null;
        }
        var finalUrl = res.url || url;
        return textWithTimeout(res, NETWORK_TIMEOUT).then(function(html) {
            var streamUrl = null;
            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                           unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) streamUrl = m3u8[1] || m3u8[0];
            }

            if (!streamUrl) {
                var cleanHtml = html.replace(/\\\//g, "/");
                var direct = cleanHtml.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                             cleanHtml.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
                if (direct) streamUrl = direct[1];
            }

            if (streamUrl) {
                if (streamUrl.indexOf("//") === 0) streamUrl = "https:" + streamUrl;
                else if (streamUrl.indexOf("/") === 0) streamUrl = host + streamUrl;

                var hdrs = { "User-Agent": USER_AGENT, "Referer": finalUrl };
                return probeM3u8Quality(streamUrl, hdrs).then(function(q) {
                    return { url: streamUrl, quality: q || "720p", server: "VidHide", headers: hdrs };
                });
            }
            logDiag("vidhide: sin m3u8 en " + finalUrl + " (html " + (html ? html.length : 0) + "b)");
            return null;
        });
    })
    .catch(function() { return null; });
}

// Extrae el m3u8 del HTML de un embed StreamWish (directo o en packer).
function extractStreamWishM3u8(html) {
    if (!html) return null;
    var cleanHtml = html.replace(/\\\//g, "/");
    var directMatch = cleanHtml.match(/(?:file|sources|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                      cleanHtml.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
    if (directMatch) return directMatch[1];

    var unpacked = unpackFromHtml(html);
    if (unpacked) {
        var m3u8 = unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                   unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
        if (m3u8) return m3u8[1] || m3u8[0];
    }
    return null;
}

function resolveStreamWish(url) {
    // v2.0: playerwish.com esta MUERTO (timeout DNS verificado), la reescritura
    // de la v1.1.1 mataba todos los streams StreamWish. Los dominios reales
    // (hglink.to, streamwish.to, strwish.com, hanerix.com, hlswish.com,
    // hgcloud.to) responden 200 hoy. Estrategia: URL ORIGINAL primero y una
    // lista corta de espejos solo si la original falla (522/404/timeout).
    var targetUrl = url;
    if (targetUrl.indexOf("/f/") !== -1 || targetUrl.indexOf("/v/") !== -1) {
        targetUrl = targetUrl.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9]+)/);
    var mirrors = [];
    if (idMatch && targetUrl.indexOf("strwish.com") === -1) {
        mirrors.push("https://strwish.com/e/" + idMatch[1]);
        mirrors.push("https://streamwish.to/e/" + idMatch[1]);
        mirrors.push("https://hanerix.com/e/" + idMatch[1]);
    }

    function tryStreamWish(candidates, idx) {
        if (idx >= candidates.length) return Promise.resolve(null);
        if (tvRemaining() < 1500) return Promise.resolve(null);
        var curUrl = candidates[idx];

        return fetchWithTimeout(curUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": MIRROR_URL + "/" },
            redirect: "follow"
        }, NETWORK_TIMEOUT)
        .then(function(res) {
            if (!res || !res.ok) {
                logDiag("streamwish: HTTP " + (res ? res.status : "null") + " " + curUrl);
                return null;
            }
            var finalUrl = res.url || curUrl;
            return textWithTimeout(res, NETWORK_TIMEOUT).then(function(html) {
                var streamUrl = extractStreamWishM3u8(html);
                if (streamUrl) {
                    if (streamUrl.indexOf("//") === 0) streamUrl = "https:" + streamUrl;
                    var hdrs = { "User-Agent": USER_AGENT, "Referer": finalUrl };
                    return probeM3u8Quality(streamUrl, hdrs).then(function(q) {
                        return { url: streamUrl, quality: q || "720p", server: "StreamWish", headers: hdrs };
                    });
                }
                logDiag("streamwish: sin m3u8 en " + finalUrl + " (html " + (html ? html.length : 0) + "b)");
                return null;
            });
        })
        .then(function(result) {
            if (result) return result;
            return tryStreamWish(candidates, idx + 1);
        })
        .catch(function() { return tryStreamWish(candidates, idx + 1); });
    }

    var candidates = [targetUrl];
    for (var m = 0; m < mirrors.length; m++) {
        if (mirrors[m] !== targetUrl) candidates.push(mirrors[m]);
    }
    return tryStreamWish(candidates, 0);
}

function resolveMixdrop(url) {
    var embedUrl = url.replace("/f/", "/e/");
    if (embedUrl.indexOf("http") !== 0) embedUrl = "https:" + embedUrl;

    return fetchWithTimeout(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": MIRROR_URL + "/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) { return res ? textWithTimeout(res, NETWORK_TIMEOUT) : ""; })
    .then(function(html) {
        if (!html) return null;
        var unpacked = unpackFromHtml(html) || "";
        var hay = html + "\n" + unpacked;
        var directMatch = hay.match(/MDCore\.(?:wurl|vurl)\s*=\s*["']([^"']+)["']/i) ||
                          hay.match(/["'](https?:\/\/[a-zA-Z0-9.-]+(?:\.delivery\.mxcontent\.net|\.mixdrop)[^"'\s<>]+\.mp4[^"'\s<>]*)["']/i);
        if (directMatch) {
            var finalUrl = directMatch[1];
            if (finalUrl.indexOf("//") === 0) finalUrl = "https:" + finalUrl;
            return { url: finalUrl, quality: "720p", server: "Mixdrop", headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } };
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveMp4upload(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) { return res ? textWithTimeout(res, NETWORK_TIMEOUT) : ""; })
    .then(function(html) {
        if (!html) return null;
        var unpacked = unpackFromHtml(html);
        if (unpacked) {
            var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                           unpacked.match(/(?:src|file)\s*:\s*["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
            if (srcMatch) return { url: srcMatch[1], quality: "720p", server: "MP4Upload", headers: { "User-Agent": USER_AGENT, "Referer": url } };
        }
        var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
        if (directMatch) return { url: directMatch[0], quality: "720p", server: "MP4Upload", headers: { "User-Agent": USER_AGENT, "Referer": url } };
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (targetUrl.indexOf("http") !== 0) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": MIRROR_URL + "/" },
        redirect: "follow"
    }, 2500)
    .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
    .then(function(html) {
        var match = html.match(/document\.getElementById\(['"](?:robotlink|ideoolink|noroot)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:\(['"]([^'"]+)['"]\)\.substring\((\d+)\)|['"]([^'"]+)['"])/i);
        if (match) {
            var p2 = (match[2] && match[3]) ? match[2].substring(parseInt(match[3], 10)) : (match[4] || "");
            var full = match[1] + p2;
            if (full.indexOf("//") === 0) full = "https:" + full;
            return { url: full, quality: "720p", server: "Streamtape", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveFilemoon(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": MIRROR_URL + "/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) { return res ? textWithTimeout(res, NETWORK_TIMEOUT) : ""; })
    .then(function(html) {
        if (!html) return null;
        var direct = html.replace(/\\\//g, "/").match(/(?:file|sources|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (!direct) {
            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                           unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) direct = [null, m3u8[1] || m3u8[0]];
            }
        }
        if (direct) {
            var hdrs = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(direct[1], hdrs, "1080p").then(function(q) {
                return { url: direct[1], quality: q || "1080p", server: "Filemoon", headers: hdrs };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

// Resolver generico para hosts desconocidos (voe, d-s.io, etc.).
// Busca m3u8/mp4 tanto en el HTML crudo como en el packer desempaquetado.
function resolveGenericEmbed(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": MIRROR_URL + "/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) { return res ? textWithTimeout(res, NETWORK_TIMEOUT) : ""; })
    .then(function(html) {
        if (!html) return null;
        var unpacked = unpackFromHtml(html) || "";
        var hay = html + "\n" + unpacked;
        var hostTag = url.replace(/^https?:\/\//i, "").split("/")[0] || "Embed";

        var m3u8 = hay.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);
        if (m3u8) {
            var hdrs = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(m3u8[0], hdrs).then(function(q) {
                return { url: m3u8[0], quality: q || "720p", server: hostTag, headers: hdrs };
            });
        }

        var mp4 = hay.match(/https?:\/\/[^"'\s<>\\]+\.mp4[^"'\s<>\\]*/i);
        if (mp4) {
            var q4 = detectQualityFromUrl(mp4[0]) || "720p";
            return { url: mp4[0], quality: q4, server: hostTag, headers: { "User-Agent": USER_AGENT, "Referer": url } };
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(url, serverName) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();
    var sName = String(serverName || "").toLowerCase();

    if (sName.indexOf("vidhide") !== -1 || u.indexOf("vidhide") !== -1 || u.indexOf("morencius") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("callistanise") !== -1) {
        return resolveVidHide(url);
    }
    if (sName.indexOf("streamwish") !== -1 || sName.indexOf("vibuxer") !== -1 || u.indexOf("streamwish") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("flaswish") !== -1 || u.indexOf("playerwish") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("hgcloud") !== -1) {
        return resolveStreamWish(url);
    }
    if (u.indexOf("mixdrop") !== -1 || u.indexOf("mxdrop") !== -1) return resolveMixdrop(url);
    if (u.indexOf("mp4upload") !== -1) return resolveMp4upload(url);
    if (u.indexOf("streamtape") !== -1) return resolveStreamtape(url);
    if (u.indexOf("filemoon") !== -1 || u.indexOf("moonplayer") !== -1) return resolveFilemoon(url);
    // Hosts de descarga directa: su HTML no contiene m3u8/mp4 de stream.
    // Se saltan ANTES del intento generico para no gastar peticiones.
    if (u.indexOf("mediafire") !== -1 || u.indexOf("mega.nz") !== -1 || u.indexOf("mega.io") !== -1 || u.indexOf("1fichier") !== -1 || u.indexOf("pixeldrain") !== -1) {
        return Promise.resolve(null);
    }
    // voe y cualquier host desconocido -> intento generico
    return resolveGenericEmbed(url);
}

// ==========================================
// 7. TMDB METADATA
// La v1.1.1 pedía /tv/../season/../episode/external_ids para el tt del
// episodio, pero el mirror NO indexa por tt de episodio (404 verificado):
// se elimina esa peticion y se usa siempre el tt de la SERIE.
// ==========================================

function getMediaData(tmdbId, mediaType) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=external_ids";

    return fetchWithTimeout(url, null, 2500)
        .then(function(res) { return res && res.ok ? jsonWithTimeout(res, 2500) : null; })
        .then(function(data) {
            if (!data) return null;
            var imdbId = (data.external_ids && data.external_ids.imdb_id) || data.imdb_id || null;
            return {
                title: isTv ? data.name : data.title,
                year: (data.release_date || data.first_air_date || "").substring(0, 4),
                imdbId: imdbId,
                isTv: isTv
            };
        })
        .catch(function() { return null; });
}

// ==========================================
// 8. OBTENER Y DESCIFRAR EMBEDS (MIRROR + EMBED69)
// Dual: Modo LINK_CHALLENGE (sin PoW) / Modo POW_CHALLENGE (PoW + salt)
// ==========================================

function parseDataLinkTolerant(html) {
    // Red de seguridad si el JSON viene con claves sin comillas u otro ruido.
    var files = [];
    var blockRe = /"video_language"\s*:\s*"([^"]+)"[\s\S]{0,400}?"sortedEmbeds"\s*:\s*\[([\s\S]*?)\]/g;
    var blockMatch;
    while ((blockMatch = blockRe.exec(html)) !== null) {
        var lang = blockMatch[1];
        var inner = blockMatch[2];
        var pairRe = /\{(?=[^{}]*"servername"\s*:\s*"([^"]*)")(?=[^{}]*"link"\s*:\s*"([^"]*)")[^{}]*\}/g;
        var pair;
        var embeds = [];
        while ((pair = pairRe.exec(inner)) !== null) {
            embeds.push({ servername: pair[1], link: pair[2] });
        }
        if (embeds.length) files.push({ video_language: lang, sortedEmbeds: embeds });
    }
    return files;
}

function fetchAndDecryptUrl(targetUrl) {
    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) {
            logDiag("ruta " + targetUrl + " -> HTTP " + (res ? res.status : "null"));
            return "";
        }
        return textWithTimeout(res, NETWORK_TIMEOUT);
    })
    .then(function(html) {
        if (!html) return [];

        var dataLinkMatch = html.match(/(?:let|var|const)\s+dataLink\s*=\s*(\[[\s\S]*?\])\s*;/i);
        var files = null;

        if (dataLinkMatch) {
            try {
                files = JSON.parse(dataLinkMatch[1]);
            } catch (eParse) {
                files = null;
            }
        }
        if (!files || !files.length) {
            files = parseDataLinkTolerant(html);
        }
        if (!files || !files.length) {
            logDiag("ruta " + targetUrl + " -> 200 sin dataLink util (html " + html.length + "b)");
            return [];
        }

        var aesKey = null;
        var mode = "LINK";

        // Soporte Dual: Modo 1 (LINK_CHALLENGE sin PoW) / Modo 2 (POW_CHALLENGE)
        var linkC = html.match(/(?:const|let|var)\s+LINK_CHALLENGE\s*=\s*['"]([^'"]+)['"]/i);
        var linkS = html.match(/(?:const|let|var)\s+LINK_SALT\s*=\s*['"]([^'"]+)['"]/i);

        if (linkC) {
            aesKey = sha256(linkC[1] + (linkS ? linkS[1] : ""));
        } else {
            var cMatch = html.match(/(?:const|let|var)\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/i);
            var dMatch = html.match(/(?:const|let|var)\s+POW_DIFFICULTY\s*=\s*(\d+)/i);
            var sMatch = html.match(/(?:const|let|var)\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/i);
            if (!cMatch) {
                logDiag("ruta " + targetUrl + " -> sin LINK_CHALLENGE ni POW_CHALLENGE");
                return [];
            }
            mode = "POW";
            var nonce = solvePoW(cMatch[1], parseInt(dMatch ? dMatch[1] : "3", 10));
            if (nonce === -1) {
                logDiag("ruta " + targetUrl + " -> PoW sin solucion (tope de tiempo)");
                return [];
            }
            aesKey = sha256(cMatch[1] + nonce + (sMatch ? sMatch[1] : ""));
        }

        var embeds = [];
        var failCount = 0;
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var lang = file.video_language === "LAT" ? "Latino" :
                       file.video_language === "ESP" ? "Castellano" :
                       file.video_language === "SUB" ? "Subtitulado" :
                       (file.video_language || "VO");
            if (file.sortedEmbeds) {
                for (var j = 0; j < file.sortedEmbeds.length; j++) {
                    var embed = file.sortedEmbeds[j];
                    var decryptedUrl = decryptAES(embed.link, aesKey);
                    if (decryptedUrl) {
                        embeds.push({ url: decryptedUrl.replace(/`/g, "").trim(), server: embed.servername, lang: lang });
                    } else {
                        failCount++;
                    }
                }
            }
        }

        logDiag("ruta " + targetUrl.replace(/^https?:\/\//i, "") + " -> OK modo " + mode + ": " + embeds.length + " embeds (" + failCount + " sin descifrar)");
        return embeds;
    })
    .catch(function() { return []; });
}

// ==========================================
// 9. FUNCION PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function buildTargetKeys(media, isTv, s, e) {
    var keys = [];
    if (!isTv) {
        keys.push(media.imdbId);
        return keys;
    }
    // Formato verificado del mirror: {imdbSerie}-SxEE con episodio a 2 digitos.
    keys.push(media.imdbId + "-" + s + "x" + pad2(e));
    // Variantes toleradas por otros endpoints (embed69) por si el mirror falla.
    keys.push(media.imdbId + "-" + s + "x" + e);
    // Ultimo recurso: clave plana de la serie (el mirror sirve su episodio por
    // defecto; puede no coincidir con el pedido -> se avisa en el log).
    keys.push(media.imdbId);
    return keys;
}

function getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var s = seasonNum !== undefined && seasonNum !== null ? parseInt(seasonNum, 10) : 1;
    var e = episodeNum !== undefined && episodeNum !== null ? parseInt(episodeNum, 10) : 1;

    return getMediaData(tmdbId, mediaType).then(function(media) {
        if (!media || !media.imdbId || !/^tt\d+$/.test(media.imdbId)) {
            logDiag("TMDB sin imdbId util (tmdbId=" + tmdbId + ")");
            return [];
        }

        logDiag("TMDB ok: '" + media.title + "' (" + media.year + ") imdb=" + media.imdbId + (isTv ? " S" + s + "E" + e : "") + " timer=" + HAS_TIMER);

        var targetKeys = buildTargetKeys(media, isTv, s, e);
        if (isTv) logDiag("claves TV: " + targetKeys.join(" , "));

        // Orden de rutas: pelispedia/vidurl PRIMERO (200 con dataLink hoy),
        // embed69 como respaldo por clave (403 WAF desde IPs de datacenter,
        // pero puede servir desde IPs residenciales del usuario).
        var candidateUrls = [];
        for (var k = 0; k < targetKeys.length; k++) {
            candidateUrls.push(MIRROR_URL + "/vidurl/" + targetKeys[k] + "/");
            candidateUrls.push(BASE_URL + "/f/" + targetKeys[k]);
        }

        function tryNextEndpoint(idx) {
            if (idx >= candidateUrls.length) return Promise.resolve([]);
            if (tvRemaining() < 1500) {
                logDiag("presupuesto bajo, no quedan rutas por probar");
                return Promise.resolve([]);
            }
            var target = candidateUrls[idx];

            return fetchAndDecryptUrl(target).then(function(embeds) {
                if (embeds && embeds.length > 0) return embeds;
                return tryNextEndpoint(idx + 1);
            });
        }

        return tryNextEndpoint(0).then(function(embedsToResolve) {
            if (!embedsToResolve || embedsToResolve.length === 0) {
                logDiag("sin embeds descifrados en ninguna ruta");
                return [];
            }

            logDiag("resolviendo " + embedsToResolve.length + " embeds en paralelo...");

            var resolvePromises = embedsToResolve.map(function(item) {
                var urlLower = item.url.toLowerCase();
                var sName = (item.server || "").toLowerCase();
                var hostTag = urlLower.replace(/^https?:\/\//i, "").split("/")[0];
                var promise = dispatchResolver(item.url, item.server);

                return promise
                    .then(function(res) {
                        if (res && res.url) {
                            logDiag("resolver " + (sName || hostTag) + " [" + item.lang + "] -> OK " + res.quality);
                            return {
                                name: "SoloLatino",
                                title: res.quality + " · " + res.server + " (" + item.lang + ")",
                                url: res.url,
                                quality: res.quality,
                                headers: res.headers || {
                                    "User-Agent": USER_AGENT,
                                    "Referer": item.url
                                }
                            };
                        }
                        logDiag("resolver " + (sName || hostTag) + " [" + item.lang + "] -> SIN resultado");
                        return null;
                    })
                    .catch(function(eR) {
                        logDiag("resolver " + (sName || hostTag) + " [" + item.lang + "] -> EXCEPCION " + (eR && eR.message ? eR.message : ""));
                        return null;
                    });
            });

            return Promise.all(resolvePromises).then(function(results) {
                var streams = [];
                var seen = [];
                for (var i = 0; i < results.length; i++) {
                    if (results[i] && results[i].url && seen.indexOf(results[i].url) === -1) {
                        seen.push(results[i].url);
                        streams.push(results[i]);
                    }
                }

                // Mejor calidad primero; desempate estable por orden de aparicion
                // (la estabilidad de sort no esta garantizada en QuickJS).
                var qRank = { "4K": 5, "1080p": 4, "720p": 3, "480p": 2, "360p": 1 };
                streams.sort(function(a, b) {
                    var ra = qRank[a.quality] || 0;
                    var rb = qRank[b.quality] || 0;
                    if (ra !== rb) return rb - ra;
                    return seen.indexOf(a.url) - seen.indexOf(b.url);
                });

                logDiag("total " + streams.length + " streams unicos de " + results.length + " resueltos");
                return streams;
            });
        });
    });
}

// Contrato: getStreams SIEMPRE devuelve una Promesa que resuelve a un Array.
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        START_TS = tvNow();
        logDiag("getStreams tmdbId=" + tmdbId + " type=" + mediaType + " s=" + seasonNum + " e=" + episodeNum);
        if (!tmdbId) return Promise.resolve([]);
        return getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum)
            .catch(function(eFatal) {
                logDiag("fallo fatal capturado: " + (eFatal && eFatal.message ? eFatal.message : eFatal));
                return [];
            });
    } catch (eSync) {
        return Promise.resolve([]);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
}
