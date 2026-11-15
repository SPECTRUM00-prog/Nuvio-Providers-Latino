/**
 * Provider: PelisPedia (Películas, Series y Anime en Latino, Castellano y Sub)
 * Dominio: https://pelispedia.mov
 * Motor: 100% Cadenas de Promesas (Hermes / FireTV / Android TV / Desktop Safe)
 * Criptografía: SHA-256 + AES-256-CBC nativo sobre TypedArrays (LINK_CHALLENGE / PoW Fallback)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://pelispedia.mov";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2600;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS DE RED & STRINGS (HERMES SAFE)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var fetchOpts = {};

    if (options) {
        for (var key in options) {
            if (Object.prototype.hasOwnProperty.call(options, key)) {
                fetchOpts[key] = options[key];
            }
        }
    }
    if (controller) {
        fetchOpts.signal = controller.signal;
    }

    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
            if (controller) {
                try { controller.abort(); } catch (e) {}
            }
            reject(new Error("Timeout tras " + limit + "ms: " + url));
        }, limit);

        fetch(url, fetchOpts)
            .then(function(res) {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(function(err) {
                clearTimeout(timer);
                reject(err);
            });
    });
}

function padZero(num) {
    var n = parseInt(num, 10) || 0;
    return n < 10 ? "0" + n : String(n);
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
    path = path.replace(/^\/(?:serie|pelicula|anime)\//i, "").replace(/\/.*$/, "");
    return cleanText(path);
}

function scoreSlugCandidate(slugOrTitle, titles, year) {
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

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var targetWords = words.length > 0 ? words : t.split(/\s+/);
        var matches = 0;

        for (var j = 0; j < targetWords.length; j++) {
            if (slugWords.indexOf(targetWords[j]) !== -1) {
                matches++;
            }
        }

        if (targetWords.length > 0 && matches > 0) {
            var ratio = (matches / targetWords.length) * 85;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && year && slugWords.indexOf(String(year)) !== -1) {
        score += 15;
    }

    return score;
}

// ==========================================
// 2. MOTOR SHA-256 ZERO-ALLOCATION (PoW + KEY)
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

var POW_W = new Uint32Array(64);
var POW_BUFFER = new Uint8Array(128);
var POW_VIEW = new DataView(POW_BUFFER.buffer);

function solvePoW(challengeStr, difficulty) {
    var cBytes = stringToUtf8Bytes(challengeStr);
    var cLen = cBytes.length;
    var fullBytes = difficulty >> 1;
    var hasHalfByte = (difficulty & 1) === 1;

    for (var nonce = 0; nonce < 200000; nonce++) {
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

        for (var t = 0; t < 16; t++) POW_W[t] = POW_VIEW.getUint32(t * 4, false);
        for (var t = 16; t < 64; t++) {
            var g0 = ((POW_W[t - 15] >>> 7) | (POW_W[t - 15] << 25)) ^ ((POW_W[t - 15] >>> 18) | (POW_W[t - 15] << 14)) ^ (POW_W[t - 15] >>> 3);
            var g1 = ((POW_W[t - 2] >>> 17) | (POW_W[t - 2] << 15)) ^ ((POW_W[t - 2] >>> 19) | (POW_W[t - 2] << 13)) ^ (POW_W[t - 2] >>> 10);
            POW_W[t] = (POW_W[t - 16] + g0 + POW_W[t - 7] + g1) | 0;
        }

        var a = 0x6a09e667, b = 0xbb67ae85, c = 0x3c6ef372, d = 0xa54ff53a;
        var e = 0x510e527f, f = 0x9b05688c, g = 0x1f83d9ab, h = 0x5be0cd19;

        for (var t = 0; t < 64; t++) {
            var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            var ch = (e & f) ^ (~e & g);
            var temp1 = (h + S1 + ch + SHA256_K[t] + POW_W[t]) | 0;
            var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var temp2 = (S0 + maj) | 0;

            h = g; g = f; f = e; e = (d + temp1) | 0;
            d = c; c = b; b = a; a = (temp1 + temp2) | 0;
        }

        var h0 = (0x6a09e667 + a) >>> 0;
        var h1 = (0xbb67ae85 + b) >>> 0;

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

function sha256(input) {
    var bytes = typeof input === "string" ? stringToUtf8Bytes(input) : input;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bitLen = bytes.length * 8;
    var newLen = (((bytes.length + 8) >> 6) + 1) << 6;
    var padded = new Uint8Array(newLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;

    var view = new DataView(padded.buffer);
    view.setUint32(newLen - 4, bitLen, false);
    var W = new Uint32Array(64);

    for (var i = 0; i < newLen; i += 64) {
        for (var t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
        for (var t = 16; t < 64; t++) {
            var g0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^ ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^ (W[t - 15] >>> 3);
            var g1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^ ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^ (W[t - 2] >>> 10);
            W[t] = (W[t - 16] + g0 + W[t - 7] + g1) | 0;
        }

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

    var out = new Uint8Array(32);
    var outView = new DataView(out.buffer);
    for (var i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
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
for (var i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
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
        for (var i = decrypted.length - pad; i < decrypted.length; i++) {
            if (decrypted[i] !== pad) return null;
        }
        return utf8BytesToString(decrypted.slice(0, decrypted.length - pad));
    } catch (e) {
        return null;
    }
}

// ==========================================
// 4. DESEMPAQUETADOR MULTI-BLOQUE (DEAN EDWARDS)
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
// 5. DETECCIÓN DINÁMICA DE CALIDAD (REGLA 6)
// ==========================================

var QUALITY_MAPS = {
    vidhide:    { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" },
    streamwish: { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" },
    filemoon:   { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" }
};
var QUALITY_ORDER = ["x", "o", "h", "n", "l"];

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();
    var qMap = null;

    if (u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("morencius") !== -1 || u.indexOf("callistanise") !== -1) {
        qMap = QUALITY_MAPS.vidhide;
    } else if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("vibuxer") !== -1 || u.indexOf("hgcloud") !== -1 || u.indexOf("playerwish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("flaswish") !== -1) {
        qMap = QUALITY_MAPS.streamwish;
    } else if (u.indexOf("filemoon") !== -1) {
        qMap = QUALITY_MAPS.filemoon;
    }

    if (qMap) {
        var urlsetMatch = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            for (var i = 0; i < QUALITY_ORDER.length; i++) {
                var tag = QUALITY_ORDER[i];
                if (tags.indexOf(tag) !== -1 && qMap[tag]) {
                    return qMap[tag];
                }
            }
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
        return res.text();
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            var pathOnly = m3u8Url.split("?")[0];
            if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "1080p";
            if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "720p";
            return "720p";
        }
        var maxW = 0;
        var maxH = 0;
        var resRegex = /RESOLUTION=(\d+)x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var w = parseInt(match[1], 10);
            var h = parseInt(match[2], 10);
            if (w > maxW) maxW = w;
            if (h > maxH) maxH = h;
        }

        if (maxW >= 3840 || maxH >= 2160) return "4K";
        if (maxW >= 1920 || maxH >= 1080) return "1080p";
        if (maxW >= 1280 || maxH >= 720) return "720p";
        if (maxW >= 854 || maxH >= 480) return "480p";
        return "720p";
    })
    .catch(function() {
        return "720p";
    });
}

// ==========================================
// 6. RESOLVERS DE STREAMING (PROMISE BASED)
// ==========================================

function resolveVidHide(url, refererUrl) {
    var hostMatch = url.match(/^(https?:\/\/[^/]+)/i);
    var host = hostMatch ? hostMatch[1] : "https://morencius.com";

    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": refererUrl || (BASE_URL + "/") },
        redirect: "follow"
    }, 2600)
    .then(function(res) {
        if (!res || !res.ok) return null;
        var finalUrl = res.url || url;
        return res.text().then(function(html) {
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

                var headers = { "User-Agent": USER_AGENT, "Referer": finalUrl };
                return probeM3u8Quality(streamUrl, headers).then(function(q) {
                    return { url: streamUrl, quality: q || "720p", server: "VidHide", headers: headers };
                });
            }
            return null;
        });
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url, refererUrl) {
    var targetUrl = url;
    if (
        targetUrl.indexOf("hglink.to") !== -1 ||
        targetUrl.indexOf("hanerix.com") !== -1 ||
        targetUrl.indexOf("hlswish.com") !== -1 ||
        targetUrl.indexOf("hgcloud.to") !== -1 ||
        targetUrl.indexOf("streamwish.to") !== -1 ||
        targetUrl.indexOf("strwish.com") !== -1 ||
        targetUrl.indexOf("flaswish.com") !== -1
    ) {
        var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://playerwish.com/e/" + idMatch[1];
    } else if (targetUrl.indexOf("/f/") !== -1 || targetUrl.indexOf("/v/") !== -1) {
        targetUrl = targetUrl.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": refererUrl || (BASE_URL + "/") },
        redirect: "follow"
    }, 2600)
    .then(function(res) {
        if (!res || !res.ok) return null;
        var finalUrl = res.url || targetUrl;
        return res.text().then(function(html) {
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
                var headers = { "User-Agent": USER_AGENT, "Referer": finalUrl };
                return probeM3u8Quality(streamUrl, headers).then(function(q) {
                    return { url: streamUrl, quality: q || "720p", server: "StreamWish", headers: headers };
                });
            }
            return null;
        });
    })
    .catch(function() { return null; });
}

function resolveFilemoon(url, refererUrl) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": refererUrl || url },
        redirect: "follow"
    }, 2600)
    .then(function(res) {
        if (!res || !res.ok) return null;
        var finalUrl = res.url || url;
        return res.text().then(function(html) {
            var streamUrl = null;
            var cleanHtml = html.replace(/\\\//g, "/");
            var directMatch = cleanHtml.match(/(?:file|sources|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
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
                var headers = { "User-Agent": USER_AGENT, "Referer": finalUrl };
                return probeM3u8Quality(streamUrl, headers).then(function(q) {
                    return { url: streamUrl, quality: q || "720p", server: "Filemoon", headers: headers };
                });
            }
            return null;
        });
    })
    .catch(function() { return null; });
}

function dispatchDirectResolver(item, playerPageUrl) {
    if (!item || !item.url) return Promise.resolve(null);
    var u = item.url.toLowerCase();
    var sName = (item.server || "").toLowerCase();
    var promise = null;

    if (
        sName.indexOf("streamwish") !== -1 ||
        u.indexOf("streamwish") !== -1 ||
        u.indexOf("hglink") !== -1 ||
        u.indexOf("hlswish") !== -1 ||
        u.indexOf("hanerix") !== -1 ||
        u.indexOf("flaswish") !== -1 ||
        u.indexOf("vibuxer") !== -1 ||
        u.indexOf("playerwish") !== -1 ||
        u.indexOf("strwish") !== -1 ||
        u.indexOf("hgcloud") !== -1
    ) {
        promise = resolveStreamWish(item.url, playerPageUrl);
    } else if (
        sName.indexOf("vidhide") !== -1 ||
        u.indexOf("vidhide") !== -1 ||
        u.indexOf("morencius") !== -1 ||
        u.indexOf("callistanise") !== -1 ||
        u.indexOf("minochinos") !== -1
    ) {
        promise = resolveVidHide(item.url, playerPageUrl);
    } else if (sName.indexOf("filemoon") !== -1 || u.indexOf("filemoon") !== -1) {
        promise = resolveFilemoon(item.url, playerPageUrl);
    }

    if (promise) {
        return promise.then(function(res) {
            if (res && res.url) {
                return {
                    name: "PelisPedia",
                    title: res.quality + " · " + (item.lang || "LAT") + " · " + res.server,
                    quality: res.quality,
                    url: res.url,
                    headers: res.headers || { "User-Agent": USER_AGENT, "Referer": item.url }
                };
            }
            return null;
        });
    }
    return Promise.resolve(null);
}

// ==========================================
// 7. MOTOR DE DESCIFRADO /VIDURL/ (SIN ANUBIS)
// ==========================================

function fetchAndDecryptPlayer(playerUrl, refererUrl) {
    return fetchWithTimeout(playerUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": refererUrl || (BASE_URL + "/") },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!res || !res.ok) return [];
        return res.text();
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

        // Modo 1 (Actual): LINK_CHALLENGE + LINK_SALT directo sin PoW
        var linkChallengeMatch = html.match(/(?:const|let|var)\s+LINK_CHALLENGE\s*=\s*['"]([^'"]+)['"]/i);
        var linkSaltMatch = html.match(/(?:const|let|var)\s+LINK_SALT\s*=\s*['"]([^'"]+)['"]/i);

        if (linkChallengeMatch) {
            var lSalt = linkSaltMatch ? linkSaltMatch[1] : "";
            aesKey = sha256(linkChallengeMatch[1] + lSalt);
        } else {
            // Modo 2 (Fallback): Reto PoW tradicional
            var powChallengeMatch = html.match(/(?:const|let|var)\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/i);
            var powDifficultyMatch = html.match(/(?:const|let|var)\s+POW_DIFFICULTY\s*=\s*(\d+)/i);
            var powSaltMatch = html.match(/(?:const|let|var)\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/i);
            if (!powChallengeMatch) return [];

            var challenge = powChallengeMatch[1];
            var difficulty = parseInt(powDifficultyMatch ? powDifficultyMatch[1] : "3", 10);
            var pSalt = powSaltMatch ? powSaltMatch[1] : "";
            var nonce = solvePoW(challenge, difficulty);
            if (nonce === -1) return [];

            aesKey = sha256(challenge + nonce + pSalt);
        }

        var embeds = [];
        for (var i = 0; i < dataLink.length; i++) {
            var file = dataLink[i];
            var lang = file.video_language === "LAT" ? "LAT" : file.video_language === "ESP" ? "ESP" : "SUB";
            if (file.sortedEmbeds) {
                for (var j = 0; j < file.sortedEmbeds.length; j++) {
                    var embed = file.sortedEmbeds[j];
                    var decryptedUrl = decryptAES(embed.link, aesKey);
                    if (decryptedUrl) {
                        var cleanUrl = decryptedUrl.replace(/`/g, "").trim();
                        embeds.push({ url: cleanUrl, server: embed.servername, lang: lang, playerPageUrl: playerUrl });
                    }
                }
            }
        }
        return embeds;
    })
    .catch(function() { return []; });
}

// ==========================================
// 8. BÚSQUEDA Y EXTRACCIÓN PELISPEDIA
// ==========================================

function searchPelisPedia(query) {
    var searchUrl = BASE_URL + "/search?s=" + encodeURIComponent(query).replace(/%20/g, "+");

    return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
        .then(function(res) { return res && res.ok ? res.text() : ""; })
        .then(function(html) {
            var results = [];
            var seen = [];

            var linkRegex = /<a\s+[^>]*href=["']((?:https?:\/\/[^"']*)?\/(?:serie|pelicula|anime)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var match;

            while ((match = linkRegex.exec(html)) !== null) {
                var rawLink = match[1];
                var innerHtml = match[2];
                var fullLink = rawLink.indexOf("http") === 0 ? rawLink : BASE_URL + rawLink;

                if (seen.indexOf(fullLink) !== -1) continue;
                seen.push(fullLink);

                var titleMatch = innerHtml.match(/<h[456][^>]*class=["'][^"']*line-clamp-2[^"']*["'][^>]*>([^<]+)<\/h[456]>/i) ||
                                 innerHtml.match(/alt=["']([^"']+)["']/i) ||
                                 innerHtml.match(/title=["']([^"']+)["']/i);

                var title = titleMatch ? titleMatch[1].trim() : cleanSlug(fullLink);
                results.push({ url: fullLink, title: title });
            }

            return results;
        })
        .catch(function() { return []; });
}

function extractVidUrlsFromHtml(html) {
    var urls = [];
    var iframeRegex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
    var match;

    while ((match = iframeRegex.exec(html)) !== null) {
        var src = match[1];
        if (src.indexOf("/vidurl/") !== -1) {
            var full = src.indexOf("http") === 0 ? src : (BASE_URL + (src.indexOf("/") === 0 ? src : "/" + src));
            if (urls.indexOf(full) === -1) urls.push(full);
        }
    }
    return urls;
}

// ==========================================
// 9. FUNCIÓN PRINCIPAL EXPORTADA (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = isMovie ? 1 : (parseInt(episode, 10) || 1);
    var epPadded = padZero(eNum);

    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles,external_ids";

    return fetchWithTimeout(tmdbUrl, null, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB HTTP Error");
            return res.json();
        })
        .then(function(meta) {
            var imdbId = meta.imdb_id || (meta.external_ids && meta.external_ids.imdb_id) || "";
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = (isMovie ? meta.release_date : meta.first_air_date || "").slice(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altTitles = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altTitles.length; i++) {
                var alt = altTitles[i].title || "";
                if (alt && titles.indexOf(alt) === -1) {
                    titles.push(alt);
                }
            }

            var queries = [];
            if (title) queries.push(title);
            if (origTitle && origTitle !== title) queries.push(origTitle);

            function trySearch(idx) {
                if (idx >= queries.length) return Promise.resolve([]);
                return searchPelisPedia(queries[idx]).then(function(res) {
                    if (res && res.length > 0) return res;
                    return trySearch(idx + 1);
                });
            }

            return trySearch(0).then(function(candidates) {
                var valid = [];
                for (var c = 0; c < candidates.length; c++) {
                    var cand = candidates[c];
                    var sc = Math.max(scoreSlugCandidate(cand.url, titles, year), scoreSlugCandidate(cand.title, titles, year));
                    if (sc >= 35) {
                        valid.push({ url: cand.url, title: cand.title, score: sc });
                    }
                }

                if (valid.length > 0) {
                    valid.sort(function(a, b) { return b.score - a.score; });
                    var targetItem = valid[0];
                    var pageUrl = targetItem.url;

                    if (!isMovie) {
                        var cleanBase = pageUrl.replace(/\/temporada\/\d+\/capitulo\/\d+/i, "").replace(/\/$/, "");
                        pageUrl = cleanBase + "/temporada/" + sNum + "/capitulo/" + eNum;
                    }

                    return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
                        .then(function(res) {
                            if (!res || !res.ok) return { urls: [], referer: pageUrl };
                            return res.text().then(function(html) {
                                var found = extractVidUrlsFromHtml(html);
                                if (found.length === 0 && imdbId) {
                                    var directId = isMovie ? imdbId : (imdbId + "-" + sNum + "x" + epPadded);
                                    found.push(BASE_URL + "/vidurl/" + directId + "/");
                                }
                                return { urls: found, referer: pageUrl };
                            });
                        });
                } else if (imdbId) {
                    var fallbackId = isMovie ? imdbId : (imdbId + "-" + sNum + "x" + epPadded);
                    return Promise.resolve({
                        urls: [BASE_URL + "/vidurl/" + fallbackId + "/"],
                        referer: BASE_URL + "/"
                    });
                }

                return Promise.resolve({ urls: [], referer: BASE_URL + "/" });
            }).then(function(playerInfo) {
                if (!playerInfo.urls || playerInfo.urls.length === 0) return [];

                var decryptPromises = playerInfo.urls.map(function(pUrl) {
                    return fetchAndDecryptPlayer(pUrl, playerInfo.referer);
                });

                return Promise.all(decryptPromises).then(function(allResults) {
                    var allEmbeds = [];
                    for (var r = 0; r < allResults.length; r++) {
                        if (Array.isArray(allResults[r])) {
                            allEmbeds = allEmbeds.concat(allResults[r]);
                        }
                    }

                    if (allEmbeds.length === 0) return [];

                    var resolvePromises = allEmbeds.map(function(item) {
                        return dispatchDirectResolver(item, item.playerPageUrl);
                    });

                    return Promise.all(resolvePromises).then(function(streams) {
                        var finalStreams = [];
                        for (var s = 0; s < streams.length; s++) {
                            if (streams[s]) finalStreams.push(streams[s]);
                        }
                        return finalStreams;
                    });
                });
            });
        })
        .catch(function() {
            return [];
        });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
}
