/**
 * Plugin de SoloLatino (Peliculas y Series) para Nuvio Media Hub
 * Motor: Criptografia PoW Dinamica + AES-256-CBC en JS Puro (Zero-Dependencies)
 * Compatible con Android TV / FireTV (QuickJS + __native_fetch), Hermes y Node
 * Resolvers: VidHide (morencius), StreamWish (playerwish / hglink)
 *
 * Cambios 1.1.1 (hardening NuvioTV):
 *  - fetch(url, options || {}) + try/catch sincrono: el puente __native_fetch de
 *    NuvioTV 1.1.1 puede rechazar opciones nulas o lanzar de forma sincrona.
 *  - textWithTimeout / jsonWithTimeout: timeout tambien sobre el CUERPO
 *    (headers 200 con cuerpo colgado ya no congelan el flujo).
 *  - getStreams garantizado a devolver Promesa -> [] ante cualquier fallo.
 *  - solvePoW: ruta rapida single-block (challenge corto) + ruta general
 *    multi-bloque para challenges largos (>= 56 bytes) sin hash corrupto.
 *  - Deduplicacion final por url (Regla 8).
 *  - Ruta primaria embed69 + respaldo pelispedia.mov/vidurl (LINK_CHALLENGE),
 *    ya que embed69.org responde 403 (WAF Anubis) a clientes no-navegador.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://embed69.org";
var MIRROR_URL = "https://pelispedia.mov";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;

// ==========================================
// 1. HELPERS DE RED & STRINGS (HERMES / QUICKJS SAFE)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    var timer = null;

    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error("Timeout"));
        }, limit);
    });

    var fetchPromise = null;
    try {
        fetchPromise = fetch(url, options || {});
        if (!fetchPromise || typeof fetchPromise.then !== "function") {
            fetchPromise = Promise.reject(new Error("fetch sin promesa"));
        }
    } catch (eSync) {
        if (timer) clearTimeout(timer);
        fetchPromise = Promise.reject(eSync);
    }

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

// Timeout sobre el CUERPO: un CDN puede responder headers 200 y colgarse enviando datos.
function textWithTimeout(res, timeoutMs) {
    var limit = timeoutMs || 3200;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.text().then(function(text) {
                if (!done) { done = true; clearTimeout(timer); resolve(text); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
    });
}

function jsonWithTimeout(res, timeoutMs) {
    var limit = timeoutMs || 3200;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.json().then(function(json) {
                if (!done) { done = true; clearTimeout(timer); resolve(json); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
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

var SHA256_IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function solvePoW(challengeStr, difficulty) {
    var cBytes = stringToUtf8Bytes(challengeStr);
    var cLen = cBytes.length;
    var fullBytes = difficulty >> 1;
    var hasHalfByte = (difficulty & 1) === 1;

    // Ruta rapida: challenge + nonce caben en un solo bloque SHA-256 (totalLen <= 55)
    if (cLen + 20 <= 55) {
        for (var nonce = 0; nonce < 300000; nonce++) {
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

            var h0 = POW_H[0] >>> 0;
            var h1 = POW_H[1] >>> 0;

            var match = true;
            if (fullBytes >= 1 && (h0 >>> 24) !== 0) match = false;
            if (match && fullBytes >= 2 && ((h0 >>> 16) & 0xff) !== 0) match = false;
            if (match && fullBytes >= 3 && ((h0 >>> 8) & 0xff) !== 0) match = false;
            if (match && fullBytes >= 4 && (h0 & 0xff) !== 0) match = false;
            if (match && hasHalfByte) {
                var shift = (3 - fullBytes) * 8 + 4;
                var nibble = fullBytes < 4 ? (h0 >>> shift) & 0x0f : (h1 >>> 28);
                if (nibble !== 0) match = false;
            }

            if (match) return nonce;
        }
        return -1;
    }

    // Ruta general multi-bloque: challenges largos (padding correcto para cualquier longitud)
    for (var nonce2 = 0; nonce2 < 300000; nonce2++) {
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

        var hh0 = H[0] >>> 0;
        var hh1 = H[1] >>> 0;

        var match2 = true;
        if (fullBytes >= 1 && (hh0 >>> 24) !== 0) match2 = false;
        if (match2 && fullBytes >= 2 && ((hh0 >>> 16) & 0xff) !== 0) match2 = false;
        if (match2 && fullBytes >= 3 && ((hh0 >>> 8) & 0xff) !== 0) match2 = false;
        if (match2 && fullBytes >= 4 && (hh0 & 0xff) !== 0) match2 = false;
        if (match2 && hasHalfByte) {
            var shift2 = (3 - fullBytes) * 8 + 4;
            var nibble2 = fullBytes < 4 ? (hh0 >>> shift2) & 0x0f : (hh1 >>> 28);
            if (nibble2 !== 0) match2 = false;
        }

        if (match2) return nonce2;
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
    for (var i = 8; i < 60; i++) {
        var temp = w[i - 1];
        if (i % 8 === 0) {
            temp = (temp << 8) | (temp >>> 24);
            temp = (SBOX[(temp >>> 24) & 0xff] << 24) | (SBOX[(temp >>> 16) & 0xff] << 16) | (SBOX[(temp >>> 8) & 0xff] << 8) | SBOX[temp & 0xff];
            temp ^= RCON[i / 8] << 24;
        } else if (i % 8 === 4) {
            temp = (SBOX[(temp >>> 24) & 0xff] << 24) | (SBOX[(temp >>> 16) & 0xff] << 16) | (SBOX[(temp >>> 8) & 0xff] << 8) | SBOX[temp & 0xff];
        }
        w[i] = (w[i - 8] ^ temp) >>> 0;
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
        for (var c = 0; c < 4; c++) {
            var s0 = state[c * 4], s1 = state[c * 4 + 1], s2 = state[c * 4 + 2], s3 = state[c * 4 + 3];
            state[c * 4 + 0] = gmult(s0, 0x0e) ^ gmult(s1, 0x0b) ^ gmult(s2, 0x0d) ^ gmult(s3, 0x09);
            state[c * 4 + 1] = gmult(s0, 0x09) ^ gmult(s1, 0x0e) ^ gmult(s2, 0x0b) ^ gmult(s3, 0x0d);
            state[c * 4 + 2] = gmult(s0, 0x0d) ^ gmult(s1, 0x09) ^ gmult(s2, 0x0e) ^ gmult(s3, 0x0b);
            state[c * 4 + 3] = gmult(s0, 0x0b) ^ gmult(s1, 0x0d) ^ gmult(s2, 0x09) ^ gmult(s3, 0x0e);
        }
    }
    var t1 = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1;
    var t = state[2]; state[2] = state[10]; state[10] = t;
    t = state[6]; state[6] = state[14]; state[14] = t;
    var t4 = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t4;
    for (var i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
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
// 5. DETECCION DINAMICA DE CALIDAD (REGLA 7)
// ==========================================

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();

    if (u.indexOf(".urlset") !== -1) {
        var m = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (m) {
            var tags = m[1].split(",");
            // VidHide / StreamWish / Filemoon: x/o/h = 1080p, n = 720p, l = 480p
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("h") !== -1) return "1080p";
            if (tags.indexOf("n") !== -1) return "720p";
            if (tags.indexOf("l") !== -1) return "480p";
        }
    }

    var pathOnly = u.split("?")[0].split("#")[0];
    if (/(?:^|[^a-z0-9])(4k|2160p?)(?:[^a-z0-9]|$)/i.test(pathOnly)) return "4K";
    if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "1080p";
    if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "720p";
    if (/(?:^|[^a-z0-9])480p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "480p";
    return null;
}

function probeM3u8Quality(m3u8Url, headers) {
    var fastQ = detectQualityFromUrl(m3u8Url);
    if (fastQ) return Promise.resolve(fastQ);

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2500)
    .then(function(res) {
        if (!res || !res.ok) return "720p";
        return textWithTimeout(res, 2500);
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            return "720p";
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
        return "720p";
    })
    .catch(function() { return "720p"; });
}

// ==========================================
// 6. RESOLVERS DE STREAMING ROBUSTOS
// ==========================================

function resolveVidHide(url) {
    var hostMatch = url.match(/^(https?:\/\/[^/]+)/i);
    var host = hostMatch ? hostMatch[1] : "https://morencius.com";

    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) return null;
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
                var direct = cleanHtml.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
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
            return null;
        });
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url) {
    var targetUrl = url;
    // Reescribir a playerwish.com para evitar error SSL de hlswish.com / flaswish.com
    if (
        targetUrl.indexOf("hglink") !== -1 ||
        targetUrl.indexOf("hanerix") !== -1 ||
        targetUrl.indexOf("hlswish") !== -1 ||
        targetUrl.indexOf("hgcloud") !== -1 ||
        targetUrl.indexOf("streamwish") !== -1 ||
        targetUrl.indexOf("strwish") !== -1 ||
        targetUrl.indexOf("flaswish") !== -1
    ) {
        var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://playerwish.com/e/" + idMatch[1];
    } else if (targetUrl.indexOf("/f/") !== -1 || targetUrl.indexOf("/v/") !== -1) {
        targetUrl = targetUrl.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) return null;
        var finalUrl = res.url || targetUrl;
        return textWithTimeout(res, NETWORK_TIMEOUT).then(function(html) {
            var streamUrl = null;
            var cleanHtml = html.replace(/\\\//g, "/");
            var directMatch = cleanHtml.match(/(?:file|sources|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                              cleanHtml.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (directMatch) streamUrl = directMatch[1];

            if (!streamUrl) {
                var unpacked = unpackFromHtml(html);
                if (unpacked) {
                    var m3u8 = unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                               unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                    if (m3u8) streamUrl = m3u8[1] || m3u8[0];
                }
            }

            if (streamUrl) {
                var hdrs = { "User-Agent": USER_AGENT, "Referer": finalUrl };
                return probeM3u8Quality(streamUrl, hdrs).then(function(q) {
                    return { url: streamUrl, quality: q || "720p", server: "StreamWish", headers: hdrs };
                });
            }
            return null;
        });
    })
    .catch(function() { return null; });
}

// ==========================================
// 7. TMDB METADATA
// ==========================================

function getMediaData(tmdbId, mediaType, seasonNum, episodeNum) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=external_ids";

    return fetchWithTimeout(url, null, 2500)
        .then(function(res) { return res && res.ok ? jsonWithTimeout(res, 2500) : null; })
        .then(function(data) {
            if (!data) return null;
            var imdbId = (data.external_ids && data.external_ids.imdb_id) || data.imdb_id || null;

            if (!imdbId && isTv) {
                var s = seasonNum !== undefined && seasonNum !== null ? parseInt(seasonNum, 10) : 1;
                var e = episodeNum !== undefined && episodeNum !== null ? parseInt(episodeNum, 10) : 1;
                var epUrl = "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + s + "/episode/" + e + "/external_ids?api_key=" + TMDB_API_KEY;

                return fetchWithTimeout(epUrl, null, 2500)
                    .then(function(epRes) { return epRes && epRes.ok ? jsonWithTimeout(epRes, 2500) : null; })
                    .then(function(epData) {
                        return {
                            title: data.name,
                            year: (data.first_air_date || "").substring(0, 4),
                            imdbId: (epData && epData.imdb_id) ? epData.imdb_id : null,
                            isEpisodeImdb: !!(epData && epData.imdb_id)
                        };
                    })
                    .catch(function() {
                        return {
                            title: data.name,
                            year: (data.first_air_date || "").substring(0, 4),
                            imdbId: null,
                            isEpisodeImdb: false
                        };
                    });
            }

            return {
                title: isTv ? data.name : data.title,
                year: (data.release_date || data.first_air_date || "").substring(0, 4),
                imdbId: imdbId,
                isEpisodeImdb: false
            };
        })
        .catch(function() { return null; });
}

// ==========================================
// 8. OBTENER Y DESCIFRAR EMBEDS (EMBED69 + RESPALDO)
// ==========================================

function fetchAndDecryptUrl(targetUrl) {
    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) return "";
        return textWithTimeout(res, NETWORK_TIMEOUT);
    })
    .then(function(html) {
        if (!html) return [];

        var dataLinkMatch = html.match(/(?:let|var|const)\s+dataLink\s*=\s*(\[[\s\S]*?\])\s*;/i);
        if (!dataLinkMatch) return [];

        var dataLink = null;
        try {
            dataLink = JSON.parse(dataLinkMatch[1]);
        } catch (e) {
            return [];
        }

        var aesKey = null;

        // Soporte Dual: Modo 1 (LINK_CHALLENGE sin PoW) / Modo 2 (POW_CHALLENGE)
        var linkC = html.match(/(?:const|let|var)\s+LINK_CHALLENGE\s*=\s*['"]([^'"]+)['"]/i);
        var linkS = html.match(/(?:const|let|var)\s+LINK_SALT\s*=\s*['"]([^'"]+)['"]/i);

        if (linkC) {
            aesKey = sha256(linkC[1] + (linkS ? linkS[1] : ""));
        } else {
            var cMatch = html.match(/(?:const|let|var)\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/i);
            var dMatch = html.match(/(?:const|let|var)\s+POW_DIFFICULTY\s*=\s*(\d+)/i);
            var sMatch = html.match(/(?:const|let|var)\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/i);
            if (!cMatch) return [];

            var nonce = solvePoW(cMatch[1], parseInt(dMatch ? dMatch[1] : "3", 10));
            if (nonce === -1) return [];
            aesKey = sha256(cMatch[1] + nonce + (sMatch ? sMatch[1] : ""));
        }

        var embeds = [];
        for (var i = 0; i < dataLink.length; i++) {
            var file = dataLink[i];
            var lang = file.video_language === "LAT" ? "Latino" : file.video_language === "ESP" ? "Castellano" : "Subtitulado";
            if (file.sortedEmbeds) {
                for (var j = 0; j < file.sortedEmbeds.length; j++) {
                    var embed = file.sortedEmbeds[j];
                    var decryptedUrl = decryptAES(embed.link, aesKey);
                    if (decryptedUrl) {
                        embeds.push({ url: decryptedUrl.replace(/`/g, "").trim(), server: embed.servername, lang: lang });
                    }
                }
            }
        }
        return embeds;
    })
    .catch(function() { return []; });
}

// ==========================================
// 9. FUNCION PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var s = seasonNum !== undefined && seasonNum !== null ? parseInt(seasonNum, 10) : 1;
    var e = episodeNum !== undefined && episodeNum !== null ? parseInt(episodeNum, 10) : 1;

    return getMediaData(tmdbId, mediaType, s, e).then(function(media) {
        if (!media || !media.imdbId || !/^tt\d+$/.test(media.imdbId)) return [];

        var targetKeys = [];
        if (!isTv) {
            targetKeys.push(media.imdbId);
        } else {
            if (media.isEpisodeImdb) {
                targetKeys.push(media.imdbId);
            }
            var epPadded = e < 10 ? "0" + e : String(e);
            targetKeys.push(media.imdbId + "-" + s + "x" + epPadded);
            targetKeys.push(media.imdbId + "-" + s + "x" + e);
            targetKeys.push(media.imdbId + "-s" + s + "e" + epPadded);
        }

        var candidateUrls = [];
        for (var k = 0; k < targetKeys.length; k++) {
            var key = targetKeys[k];
            // 1. Ruta directa embed69
            candidateUrls.push(BASE_URL + "/f/" + key);
            // 2. Respaldo pelispedia.mov/vidurl (LINK_CHALLENGE, sin WAF Anubis)
            candidateUrls.push(MIRROR_URL + "/vidurl/" + key + "/");
        }

        function tryNextEndpoint(idx) {
            if (idx >= candidateUrls.length) return Promise.resolve([]);
            var target = candidateUrls[idx];

            return fetchAndDecryptUrl(target).then(function(embeds) {
                if (embeds && embeds.length > 0) return embeds;
                return tryNextEndpoint(idx + 1);
            });
        }

        return tryNextEndpoint(0).then(function(embedsToResolve) {
            if (!embedsToResolve || embedsToResolve.length === 0) return [];

            var resolvePromises = embedsToResolve.map(function(item) {
                var urlLower = item.url.toLowerCase();
                var sName = (item.server || "").toLowerCase();
                var promise = null;

                if (sName.indexOf("vidhide") !== -1 || urlLower.indexOf("vidhide") !== -1 || urlLower.indexOf("morencius") !== -1 || urlLower.indexOf("minochinos") !== -1 || urlLower.indexOf("callistanise") !== -1) {
                    promise = resolveVidHide(item.url);
                } else if (sName.indexOf("streamwish") !== -1 || urlLower.indexOf("streamwish") !== -1 || urlLower.indexOf("hglink") !== -1 || urlLower.indexOf("hlswish") !== -1 || urlLower.indexOf("flaswish") !== -1 || urlLower.indexOf("playerwish") !== -1 || urlLower.indexOf("vibuxer") !== -1) {
                    promise = resolveStreamWish(item.url);
                } else {
                    // Servidores sin resolver propio (voe, etc.): se ignoran sin gastar peticiones
                    promise = Promise.resolve(null);
                }

                return promise
                    .then(function(res) {
                        if (res && res.url) {
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
                        return null;
                    })
                    .catch(function() {
                        return null;
                    });
            });

            return Promise.all(resolvePromises).then(function(results) {
                var streams = [];
                var seen = {};
                for (var i = 0; i < results.length; i++) {
                    if (results[i] && results[i].url && !seen[results[i].url]) {
                        seen[results[i].url] = true;
                        streams.push(results[i]);
                    }
                }
                return streams;
            });
        });
    });
}

// Contrato: getStreams SIEMPRE devuelve una Promesa que resuelve a un Array.
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        if (!tmdbId) return Promise.resolve([]);
        return getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum);
    } catch (eSync) {
        return Promise.resolve([]);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} 
