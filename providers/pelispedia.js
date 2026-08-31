/**
 * Provider: PelisPedia (Películas, Series y Anime en Latino, Castellano y Sub)
 * Dominio: https://pelispedia.mov
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://pelispedia.mov";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": `${BASE_URL}/`
};

// ============================================================================
// 1. CRIPTOGRAFÍA EN JS PURO: SHA-256 Y AES-256-CBC (PARA EMBED69)
// ============================================================================

function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
function ch(x, y, z) { return (x & y) ^ (~x & z); }
function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
function sigma0(x) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
function sigma1(x) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
function gamma0(x) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
function gamma1(x) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Bytes(msgBytes) {
    var l = msgBytes.length;
    var bitLen = l * 8;
    var newLen = ((l + 9 + 63) >> 6) << 6;
    var b = new Uint8Array(newLen);
    b.set(msgBytes);
    b[l] = 0x80;
    var view = new DataView(b.buffer);
    view.setUint32(newLen - 4, bitLen >>> 0);
    view.setUint32(newLen - 8, Math.floor(bitLen / 0x100000000));

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Int32Array(64);

    for (var i = 0; i < newLen; i += 64) {
        for (var t = 0; t < 16; t++) {
            W[t] = view.getInt32(i + (t * 4));
        }
        for (var t = 16; t < 64; t++) {
            W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) | 0;
        }

        var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

        for (var t = 0; t < 64; t++) {
            var T1 = (h + sigma1(e) + ch(e, f, g) + K256[t] + W[t]) | 0;
            var T2 = (sigma0(a) + maj(a, b, c)) | 0;
            h = g;
            g = f;
            f = e;
            e = (d + T1) | 0;
            d = c;
            c = b;
            b = a;
            a = (T1 + T2) | 0;
        }

        H[0] = (H[0] + a) | 0;
        H[1] = (H[1] + b) | 0;
        H[2] = (H[2] + c) | 0;
        H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0;
        H[5] = (H[5] + f) | 0;
        H[6] = (H[6] + g) | 0;
        H[7] = (H[7] + h) | 0;
    }

    var res = "";
    for (var j = 0; j < 8; j++) {
        var hex = (H[j] >>> 0).toString(16);
        while (hex.length < 8) hex = "0" + hex;
        res += hex;
    }
    return res;
}

function stringToUtf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 128) out.push(c);
        else if (c < 2048) {
            out.push(192 | (c >> 6));
            out.push(128 | (c & 63));
        } else {
            out.push(224 | (c >> 12));
            out.push(128 | ((c >> 6) & 63));
            out.push(128 | (c & 63));
        }
    }
    return new Uint8Array(out);
}

function hexToBytes(hex) {
    var bytes = [];
    for (var c = 0; c < hex.length; c += 2) {
        bytes.push(parseInt(hex.substr(c, 2), 16));
    }
    return new Uint8Array(bytes);
}

function solveProofOfWork(challenge, difficulty) {
    var prefix = "";
    for (var i = 0; i < difficulty; i++) prefix += "0";
    var chalBytes = stringToUtf8(challenge);
    var nonce = 0;

    while (nonce < 200000) {
        var nStr = nonce.toString();
        var nBytes = stringToUtf8(nStr);
        var combined = new Uint8Array(chalBytes.length + nBytes.length);
        combined.set(chalBytes, 0);
        combined.set(nBytes, chalBytes.length);

        var hash = sha256Bytes(combined);
        if (hash.startsWith(prefix)) {
            return nonce;
        }
        nonce++;
    }
    return 0;
}

var ISBOX = [
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
    0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
    0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
    0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
    0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
    0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
    0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
    0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
    0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
    0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
    0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d
];

var SBOX = [
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
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5e, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
];

var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function keyExpansion256(key) {
    var w = new Uint8Array(240);
    w.set(key);
    var bytesGenerated = 32;
    var rconIteration = 1;
    var temp = new Uint8Array(4);

    while (bytesGenerated < 240) {
        for (var i = 0; i < 4; i++) temp[i] = w[bytesGenerated - 4 + i];
        if (bytesGenerated % 32 === 0) {
            var k0 = temp[0];
            temp[0] = SBOX[temp[1]] ^ RCON[rconIteration++];
            temp[1] = SBOX[temp[2]];
            temp[2] = SBOX[temp[3]];
            temp[3] = SBOX[k0];
        } else if (bytesGenerated % 32 === 16) {
            for (var i = 0; i < 4; i++) temp[i] = SBOX[temp[i]];
        }
        for (var i = 0; i < 4; i++) {
            w[bytesGenerated] = w[bytesGenerated - 32] ^ temp[i];
            bytesGenerated++;
        }
    }
    return w;
}

function gmul(a, b) {
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

function invCipher(state, w) {
    var Nr = 14;
    function addRoundKey(round) {
        for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 4; c++) {
                state[r + 4 * c] ^= w[round * 16 + c * 4 + r];
            }
        }
    }
    function invShiftRows() {
        var t1 = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1;
        var t2 = state[2]; state[2] = state[10]; state[10] = t2;
        t2 = state[6]; state[6] = state[14]; state[14] = t2;
        var t3 = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t3;
    }
    function invSubBytes() {
        for (var i = 0; i < 16; i++) state[i] = ISBOX[state[i]];
    }
    function invMixColumns() {
        for (var c = 0; c < 4; c++) {
            var i0 = state[c * 4], i1 = state[c * 4 + 1], i2 = state[c * 4 + 2], i3 = state[c * 4 + 3];
            state[c * 4] = gmul(0x0e, i0) ^ gmul(0x0b, i1) ^ gmul(0x0d, i2) ^ gmul(0x09, i3);
            state[c * 4 + 1] = gmul(0x09, i0) ^ gmul(0x0e, i1) ^ gmul(0x0b, i2) ^ gmul(0x0d, i3);
            state[c * 4 + 2] = gmul(0x0d, i0) ^ gmul(0x09, i1) ^ gmul(0x0e, i2) ^ gmul(0x0b, i3);
            state[c * 4 + 3] = gmul(0x0b, i0) ^ gmul(0x0d, i1) ^ gmul(0x09, i2) ^ gmul(0x0e, i3);
        }
    }

    addRoundKey(Nr);
    for (var round = Nr - 1; round > 0; round--) {
        invShiftRows();
        invSubBytes();
        addRoundKey(round);
        invMixColumns();
    }
    invShiftRows();
    invSubBytes();
    addRoundKey(0);
}

function decryptAes256Cbc(cipherBytes, keyBytes, ivBytes) {
    var expKey = keyExpansion256(keyBytes);
    var plain = new Uint8Array(cipherBytes.length);
    var prevBlock = ivBytes;
    var state = new Uint8Array(16);

    for (var i = 0; i < cipherBytes.length; i += 16) {
        state.set(cipherBytes.subarray(i, i + 16));
        invCipher(state, expKey);
        for (var j = 0; j < 16; j++) {
            plain[i + j] = state[j] ^ prevBlock[j];
        }
        prevBlock = cipherBytes.subarray(i, i + 16);
    }

    var pad = plain[plain.length - 1];
    if (pad > 0 && pad <= 16) {
        return plain.subarray(0, plain.length - pad);
    }
    return plain;
}

// ============================================================================
// 2. UTILIDADES DE NORMALIZACIÓN Y SCORING
// ============================================================================

function normalizeText(text) {
    if (!text) return "";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
}

function cleanSlug(urlOrSlug) {
    if (!urlOrSlug) return "";
    var path = urlOrSlug.replace(/^https?:\/\/[^/]+/i, "");
    path = path.replace(/^\/(?:serie|pelicula|anime)\//i, "").replace(/\/.*$/, "");
    return normalizeText(path);
}

function scoreSlugCandidate(slugOrTitle, titles) {
    if (!slugOrTitle) return 0;
    var cleanS = cleanSlug(slugOrTitle).replace(/-/g, " ");
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = normalizeText(titles[i]).replace(/-/g, " ");
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
            var ratio = (matches / words.length) * 85;
            score = Math.max(score, ratio);
        }
    }

    return score;
}

function probeM3u8Quality(m3u8Url, headers) {
    if (!m3u8Url || !m3u8Url.includes(".m3u8")) return Promise.resolve("720p");
    return fetch(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function(res) { return res.ok ? res.text() : ""; })
        .then(function(text) {
            if (!text || !text.includes("#EXT-X-STREAM-INF")) {
                if (m3u8Url.includes("1080")) return "1080p";
                if (m3u8Url.includes("720")) return "720p";
                return "720p";
            }
            var maxH = 0, resRegex = /RESOLUTION=\d+x(\d+)/gi, match;
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
        .catch(function() { return "720p"; });
}

function unpackDeanEdwards(p, a, c, k) {
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
    return p.replace(/\b([0-9a-zA-Z]+)\b/g, function(token) {
        var index = decodeBase(token, a);
        if (isNaN(index) || index >= k.length) return token;
        return (k[index] && k[index] !== "") ? k[index] : token;
    });
}

// ============================================================================
// 3. RESOLVERS DE STREAMING
// ============================================================================

function resolveEmbed69(embedUrl) {
    return fetch(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" } })
        .then(function(res) {
            if (!res.ok) throw new Error("Embed69 HTTP " + res.status);
            return res.text();
        })
        .then(function(html) {
            var challengeMatch = html.match(/(?:var|let|const)?\s*challenge\s*=\s*['"]([^'"]+)['"]/i);
            var diffMatch = html.match(/(?:var|let|const)?\s*difficulty\s*=\s*(\d+)/i);
            var dataMatch = html.match(/(?:var|let|const)?\s*dataLink\s*=\s*['"]([^'"]+)['"]/i);

            if (!challengeMatch || !diffMatch || !dataMatch) {
                return [];
            }

            var challenge = challengeMatch[1];
            var difficulty = parseInt(diffMatch[1], 10);
            var dataLinkHex = dataMatch[1];

            var solution = solveProofOfWork(challenge, difficulty);
            var keyStr = challenge + solution;
            var keyBytes = hexToBytes(sha256Bytes(stringToUtf8(keyStr)));
            var cipherAll = hexToBytes(dataLinkHex);

            var ivBytes = cipherAll.subarray(0, 16);
            var cipherBytes = cipherAll.subarray(16);
            var decryptedBytes = decryptAes256Cbc(cipherBytes, keyBytes, ivBytes);

            var decryptedText = "";
            for (var b = 0; b < decryptedBytes.length; b++) {
                decryptedText += String.fromCharCode(decryptedBytes[b]);
            }

            var cleanJson = decryptedText.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
            var linksObj = JSON.parse(cleanJson);

            var streams = [];
            var keys = Object.keys(linksObj);

            for (var k = 0; k < keys.length; k++) {
                var lang = keys[k];
                var srvList = linksObj[lang];
                if (Array.isArray(srvList)) {
                    for (var s = 0; s < srvList.length; s++) {
                        var item = srvList[s];
                        if (item && item.link) {
                            streams.push({
                                server: item.server || "Stream",
                                lang: lang.toUpperCase(),
                                url: item.link
                            });
                        }
                    }
                }
            }

            var resolvePromises = streams.map(function(st) {
                return dispatchDirectResolver(st.url, st.lang);
            });

            return Promise.all(resolvePromises);
        })
        .then(function(resolved) {
            return resolved.filter(function(r) { return r !== null; });
        })
        .catch(function() { return []; });
}

function resolveStreamWish(url, lang) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://hglink.to/" } })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var m3uMatch = html.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
            if (!m3uMatch) {
                var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
                if (packMatch) {
                    var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
                    m3uMatch = unpacked.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
                }
            }

            if (m3uMatch) {
                return probeM3u8Quality(m3uMatch[0]).then(function(q) {
                    return {
                        name: "PelisPedia",
                        title: `${q || "720p"} · ${lang || "LAT"} · StreamWish`,
                        quality: q || "720p",
                        url: m3uMatch[0],
                        headers: { "User-Agent": USER_AGENT, "Referer": url }
                    };
                });
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveVidHide(url, lang) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://morencius.com/" } })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
            var m3uMatch = null;
            if (packMatch) {
                var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
                m3uMatch = unpacked.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
            }
            if (!m3uMatch) {
                m3uMatch = html.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
            }

            if (m3uMatch) {
                return probeM3u8Quality(m3uMatch[0]).then(function(q) {
                    return {
                        name: "PelisPedia",
                        title: `${q || "1080p"} · ${lang || "LAT"} · VidHide`,
                        quality: q || "1080p",
                        url: m3uMatch[0],
                        headers: { "User-Agent": USER_AGENT, "Referer": url }
                    };
                });
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveVoe(url, lang) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://voe.sx/" } })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var hlsMatch = html.match(/['"]hls['"]\s*:\s*['"]([^'"]+)['"]/i) ||
                           html.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
            if (hlsMatch) {
                var m3u8 = hlsMatch[1] || hlsMatch[0];
                return probeM3u8Quality(m3u8).then(function(q) {
                    return {
                        name: "PelisPedia",
                        title: `${q || "1080p"} · ${lang || "LAT"} · Voe`,
                        quality: q || "1080p",
                        url: m3u8,
                        headers: { "User-Agent": USER_AGENT, "Referer": url }
                    };
                });
            }
            return null;
        })
        .catch(function() { return null; });
}

function dispatchDirectResolver(url, lang) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    if (u.includes("embed69.org")) {
        return resolveEmbed69(url);
    }
    if (u.includes("voe.sx") || u.includes("johnbeyondnation") || u.includes("voe-unblock")) {
        return resolveVoe(url, lang);
    }
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish") || u.includes("sfasthwish") || u.includes("hanerix") || u.includes("hglink")) {
        return resolveStreamWish(url, lang);
    }
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("filelions") || u.includes("minochinos") || u.includes("morencius")) {
        return resolveVidHide(url, lang);
    }
    return Promise.resolve(null);
}

// ============================================================================
// 4. BÚSQUEDA Y PARSER DE PELISPEDIA
// ============================================================================

function searchPelisPedia(query) {
    var searchUrl = `${BASE_URL}/search?s=${encodeURIComponent(query).replace(/%20/g, "+")}`;

    return fetch(searchUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var results = [];
            var seen = [];

            var linkRegex = /<a\s+[^>]*href=["']((?:https?:\/\/[^"']*)?\/(?:serie|pelicula|anime)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var match;

            while ((match = linkRegex.exec(html)) !== null) {
                var rawLink = match[1];
                var innerHtml = match[2];

                var link = rawLink.startsWith("http") ? rawLink : `${BASE_URL}${rawLink}`;
                if (seen.indexOf(link) !== -1) continue;
                seen.push(link);

                var titleMatch = innerHtml.match(/<h[456][^>]*class=["'][^"']*line-clamp-2[^"']*["'][^>]*>([^<]+)<\/h[456]>/i) ||
                                 innerHtml.match(/alt=["']([^"']+)["']/i) ||
                                 innerHtml.match(/title=["']([^"']+)["']/i);

                var title = titleMatch ? titleMatch[1].trim() : cleanSlug(link);
                results.push({ url: link, title: title });
            }

            return results;
        })
        .catch(function() { return []; });
}

function extractPlayerIdsFromHtml(html) {
    var ids = [];
    var iframeRegex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
    var match;

    while ((match = iframeRegex.exec(html)) !== null) {
        var src = match[1];
        var vidMatch = src.match(/\/vidurl\/([^\/]+)/i);
        if (vidMatch && ids.indexOf(vidMatch[1]) === -1) {
            ids.push(vidMatch[1]);
        }
    }
    return ids;
}

// ============================================================================
// 5. FUNCIÓN PRINCIPAL EXPORTADA
// ============================================================================

function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[PelisPedia] Buscando TMDB ID ${tmdbId} (${mediaType})`);
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = isMovie ? 1 : (parseInt(episode, 10) || 1);

    var tmdbUrl = `https://api.themoviedb.org/3/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=alternative_titles,external_ids`;

    return fetch(tmdbUrl)
        .then(function(res) {
            if (!res.ok) throw new Error("TMDB HTTP " + res.status);
            return res.json();
        })
        .then(function(meta) {
            var imdbId = meta.imdb_id || (meta.external_ids && meta.external_ids.imdb_id) || "";
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;

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
                    var sc = Math.max(scoreSlugCandidate(cand.url, titles), scoreSlugCandidate(cand.title, titles));
                    if (sc >= 35) {
                        valid.push({ url: cand.url, title: cand.title, score: sc });
                    }
                }

                if (valid.length === 0) return [];

                valid.sort(function(a, b) { return b.score - a.score; });

                var targetItem = valid[0];
                var pageUrl = targetItem.url;

                if (!isMovie) {
                    var cleanBase = pageUrl.replace(/\/temporada\/\d+\/capitulo\/\d+/i, "").replace(/\/$/, "");
                    pageUrl = `${cleanBase}/temporada/${sNum}/capitulo/${eNum}`;
                }

                console.log(`[PelisPedia] Consultando página: ${pageUrl}`);

                return fetch(pageUrl, { headers: DEFAULT_HEADERS })
                    .then(function(res) {
                        if (!res.ok) throw new Error("HTTP " + res.status);
                        return res.text();
                    })
                    .then(function(html) {
                        var playerIds = extractPlayerIdsFromHtml(html);
                        var ePadded = eNum < 10 ? "0" + eNum : "" + eNum;

                        if (playerIds.length === 0 && imdbId) {
                            var directId = isMovie ? imdbId : `${imdbId}-${sNum}x${ePadded}`;
                            playerIds.push(directId);
                        }

                        var promises = playerIds.map(function(pId) {
                            var embedUrl = `https://embed69.org/f/${pId}`;
                            return resolveEmbed69(embedUrl);
                        });

                        return Promise.all(promises);
                    })
                    .then(function(results) {
                        var flat = [];
                        for (var i = 0; i < results.length; i++) {
                            var item = results[i];
                            if (Array.isArray(item)) {
                                flat = flat.concat(item);
                            } else if (item && item.url) {
                                flat.push(item);
                            }
                        }
                        return flat;
                    });
            });
        })
        .then(function(streams) {
            console.log(`[PelisPedia] ✓ ${streams.length} streams válidos extraídos`);
            return streams;
        })
        .catch(function(err) {
            console.log(`[PelisPedia] Error: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
