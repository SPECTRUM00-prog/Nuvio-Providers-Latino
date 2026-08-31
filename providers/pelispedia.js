/**
 * Provider: PelisPedia (Películas, Series y Anime en Latino, Castellano y Sub)
 * Dominio: https://pelispedia.mov
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://pelispedia.mov";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS BASE64 & STRINGS (HERMES SAFE)
// ==========================================
function decodeB64ToBytes(b64) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(b64).replace(/[=]+$/, "");
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
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0xd800 || code >= 0xe000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            i++;
            code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return new Uint8Array(bytes);
}

function utf8BytesToString(bytes) {
    var str = "";
    var i = 0;
    while (i < bytes.length) {
        var b1 = bytes[i++];
        if (b1 < 0x80) {
            str += String.fromCharCode(b1);
        } else if (b1 > 0xbf && b1 < 0xe0) {
            var b2 = bytes[i++];
            str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
        } else if (b1 > 0xdf && b1 < 0xf0) {
            var b2 = bytes[i++];
            var b3 = bytes[i++];
            str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
        } else {
            var b2 = bytes[i++];
            var b3 = bytes[i++];
            var b4 = bytes[i++];
            var code = (((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)) - 0x10000;
            str += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        }
    }
    return str;
}

// ==========================================
// 2. MOTOR SHA-256 PURO (Síncrono)
// ==========================================
function sha256(input) {
    var bytes = typeof input === "string" ? stringToUtf8Bytes(input) : input;
    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

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
            var gamma0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^ ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^ (W[t - 15] >>> 3);
            var gamma1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^ ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^ (W[t - 2] >>> 10);
            W[t] = (W[t - 16] + gamma0 + W[t - 7] + gamma1) | 0;
        }

        var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

        for (var t = 0; t < 64; t++) {
            var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            var ch = (e & f) ^ (~e & g);
            var temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
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

function sha256Hex(str) {
    var bytes = sha256(str);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return hex;
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
    for (var i = 0; i < 8; i++) {
        w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    }
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
        var t1 = state[13];
        state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1;
        var t = state[2]; state[2] = state[10]; state[10] = t;
        t = state[6]; state[6] = state[14]; state[14] = t;
        var t4 = state[3];
        state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t4;

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

    var t1 = state[13];
    state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1;
    var t = state[2]; state[2] = state[10]; state[10] = t;
    t = state[6]; state[6] = state[14]; state[14] = t;
    var t4 = state[3];
    state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t4;

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
            for (var j = 0; j < 16; j++) {
                decrypted[i + j] = invBlock[j] ^ prevBlock[j];
            }
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
// 4. DESEMPAQUETADOR DEAN EDWARDS
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
// 5. DETECCIÓN DINÁMICA DE RESOLUCIÓN REAL
// ==========================================
function probeM3u8Quality(m3u8Url, headers) {
    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    return fetch(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    })
    .then(function(res) {
        if (!res.ok) return "720p";
        return res.text();
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

function cleanSlug(urlOrSlug) {
    if (!urlOrSlug) return "";
    var path = urlOrSlug.replace(/^https?:\/\/[^/]+/i, "");
    path = path.replace(/^\/(?:serie|pelicula|anime)\//i, "").replace(/\/.*$/, "");
    return path.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreSlugCandidate(slugOrTitle, titles) {
    if (!slugOrTitle) return 0;
    var cleanS = cleanSlug(slugOrTitle);
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanSlug(titles[i]);
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

// ==========================================
// 6. RESOLVERS DE STREAMING (PROMISE BASED)
// ==========================================
function resolveVidHide(url) {
    var targetUrl = url;
    var fileCodeMatch = targetUrl.match(/file_code=([a-zA-Z0-9]+)/i);
    if (fileCodeMatch) {
        targetUrl = "https://morencius.com/embed/" + fileCodeMatch[1];
    } else if (targetUrl.includes("/v/") && !targetUrl.includes("/embed/")) {
        targetUrl = targetUrl.replace("/v/", "/embed/");
    }

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var direct = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (direct) streamUrl = direct[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) streamUrl = m3u8[0].replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": targetUrl };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return { url: streamUrl, quality: q || "720p", server: "VidHide", headers: headers };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url) {
    var targetUrl = url;
    var fileCodeMatch = targetUrl.match(/file_code=([a-zA-Z0-9]+)/i);
    if (fileCodeMatch) {
        targetUrl = "https://hlswish.com/e/" + fileCodeMatch[1];
    } else if (!targetUrl.includes("/e/")) {
        var id = targetUrl.replace(/\/$/, "").split("/").pop();
        targetUrl = "https://hlswish.com/e/" + id;
    }

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var directMatch = html.match(/(?:file|sources)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                          html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (directMatch) streamUrl = directMatch[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                           unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
                if (m3u8) streamUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": targetUrl };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return { url: streamUrl, quality: q || "720p", server: "StreamWish", headers: headers };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveVoe(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
    .then(function(res) {
        var finalUrl = res.url || url;
        return res.text().then(function(html) {
            var streamUrl = null;
            var hlsMatch = html.match(/['"]hls['"]\s*:\s*['"]([^'"]+)['"]/i) ||
                           html.match(/https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?/i);
            if (hlsMatch) {
                streamUrl = (hlsMatch[1] || hlsMatch[0]).replace(/\\/g, "");
            }

            if (streamUrl) {
                var headers = { "User-Agent": USER_AGENT, "Referer": finalUrl };
                return probeM3u8Quality(streamUrl, headers).then(function(q) {
                    return { url: streamUrl, quality: q || "1080p", server: "Voe", headers: headers };
                });
            }
            return null;
        });
    })
    .catch(function() { return null; });
}

function dispatchDirectResolver(item) {
    if (!item || !item.url) return Promise.resolve(null);
    var u = item.url.toLowerCase();
    var sName = (item.server || "").toLowerCase();
    var promise = null;

    if (sName === "voe" || u.includes("voe.sx") || u.includes("johnbeyondnation")) {
        promise = resolveVoe(item.url);
    } else if (sName === "streamwish" || u.includes("streamwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("hlswish") || u.includes("flaswish")) {
        promise = resolveStreamWish(item.url);
    } else if (sName === "vidhide" || u.includes("vidhide") || u.includes("morencius") || u.includes("callistanise") || u.includes("minochinos") || u.includes("vidhideplus")) {
        promise = resolveVidHide(item.url);
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
// 7. MOTOR DE DESCIFRADO EMBED69
// ==========================================
function fetchAndDecryptEmbed69(targetUrl) {
    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
    })
    .then(function(res) {
        if (!res.ok) return [];
        return res.text();
    })
    .then(function(html) {
        var challengeMatch = html.match(/const\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/);
        var difficultyMatch = html.match(/const\s+POW_DIFFICULTY\s*=\s*(\d+)/);
        var saltMatch = html.match(/const\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/);
        var dataLinkMatch = html.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/);

        if (!challengeMatch || !dataLinkMatch) return [];

        var challenge = challengeMatch[1];
        var difficulty = parseInt(difficultyMatch ? difficultyMatch[1] : "3", 10);
        var salt = saltMatch ? saltMatch[1] : "";
        var dataLink = JSON.parse(dataLinkMatch[1]);

        var prefix = "0".repeat(difficulty);
        var nonce = 0;
        var maxIterations = 200000;

        while (nonce < maxIterations) {
            var hash = sha256Hex(challenge + nonce);
            if (hash.startsWith(prefix)) break;
            nonce++;
        }

        if (nonce >= maxIterations) return [];

        var aesKey = sha256(challenge + nonce + salt);
        var embeds = [];

        for (var i = 0; i < dataLink.length; i++) {
            var file = dataLink[i];
            var lang = file.video_language === "LAT" ? "LAT" : file.video_language === "ESP" ? "ESP" : "SUB";
            if (file.sortedEmbeds) {
                for (var j = 0; j < file.sortedEmbeds.length; j++) {
                    var embed = file.sortedEmbeds[j];
                    var decryptedUrl = decryptAES(embed.link, aesKey);
                    if (decryptedUrl) {
                        embeds.push({ url: decryptedUrl, server: embed.servername, lang: lang });
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

                var link = rawLink.startsWith("http") ? rawLink : BASE_URL + rawLink;
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

// ==========================================
// 9. FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================
function getStreams(tmdbId, mediaType, season, episode) {
    console.log("[PelisPedia] Buscando TMDB ID " + tmdbId + " (" + mediaType + ")");
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = isMovie ? 1 : (parseInt(episode, 10) || 1);

    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles,external_ids";

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
                    pageUrl = cleanBase + "/temporada/" + sNum + "/capitulo/" + eNum;
                }

                console.log("[PelisPedia] Consultando página: " + pageUrl);

                return fetch(pageUrl, { headers: DEFAULT_HEADERS })
                    .then(function(res) {
                        if (!res.ok) throw new Error("HTTP " + res.status);
                        return res.text();
                    })
                    .then(function(html) {
                        var playerIds = extractPlayerIdsFromHtml(html);
                        var ePadded = String(eNum).padStart(2, "0");

                        if (playerIds.length === 0 && imdbId) {
                            var directId = isMovie ? imdbId : imdbId + "-" + sNum + "x" + ePadded;
                            playerIds.push(directId);
                        }

                        var promises = playerIds.map(function(pId) {
                            var embedUrl = "https://embed69.org/f/" + pId;
                            return fetchAndDecryptEmbed69(embedUrl);
                        });

                        return Promise.all(promises);
                    })
                    .then(function(results) {
                        var allDecrypted = [];
                        for (var i = 0; i < results.length; i++) {
                            if (Array.isArray(results[i])) {
                                allDecrypted = allDecrypted.concat(results[i]);
                            }
                        }

                        var resolvePromises = allDecrypted.map(function(item) {
                            return dispatchDirectResolver(item);
                        });

                        return Promise.all(resolvePromises);
                    })
                    .then(function(streams) {
                        var finalStreams = [];
                        for (var i = 0; i < streams.length; i++) {
                            if (streams[i]) finalStreams.push(streams[i]);
                        }
                        return finalStreams;
                    });
            });
        })
        .then(function(streams) {
            console.log("[PelisPedia] ✓ " + streams.length + " streams válidos extraídos");
            return streams;
        })
        .catch(function(err) {
            console.log("[PelisPedia] Error: " + err.message);
            return [];
        });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
