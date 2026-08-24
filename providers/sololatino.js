/**
 * Plugin de SoloLatino (Películas y Series) para Nuvio Media Hub
 * Compatible con Android TV y FireTV (Hermes Engine - 100% Pure JS / Zero-Dependencies)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://embed69.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ==========================================
// 1. HELPERS PUROS: BASE64 & UTF-8 (HERMES SAFE)
// ==========================================
function decodeB64ToBytes(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let str = String(b64).replace(/[=]+$/, "");
    if (str.length % 4 === 1) return new Uint8Array(0);
    let output = [];
    for (let bc = 0, bs = 0, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output.push(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return new Uint8Array(output);
}

function decodeB64(input) {
    if (!input) return null;
    const bytes = decodeB64ToBytes(input);
    let str = "";
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return str;
}

function stringToUtf8Bytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
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
    let str = "";
    let i = 0;
    while (i < bytes.length) {
        let b1 = bytes[i++];
        if (b1 < 0x80) {
            str += String.fromCharCode(b1);
        } else if (b1 > 0xbf && b1 < 0xe0) {
            let b2 = bytes[i++];
            str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
        } else if (b1 > 0xdf && b1 < 0xf0) {
            let b2 = bytes[i++];
            let b3 = bytes[i++];
            str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
        } else {
            let b2 = bytes[i++];
            let b3 = bytes[i++];
            let b4 = bytes[i++];
            let code = (((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)) - 0x10000;
            str += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        }
    }
    return str;
}

// ==========================================
// 2. MOTOR SHA-256 PURO (Zero Dependencies)
// ==========================================
function sha256(input) {
    const bytes = typeof input === "string" ? stringToUtf8Bytes(input) : input;
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    
    const bitLen = bytes.length * 8;
    const newLen = (((bytes.length + 8) >> 6) + 1) << 6;
    const padded = new Uint8Array(newLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;

    const view = new DataView(padded.buffer);
    view.setUint32(newLen - 4, bitLen, false);

    const W = new Uint32Array(64);

    for (let i = 0; i < newLen; i += 64) {
        for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
        for (let t = 16; t < 64; t++) {
            const gamma0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^ ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^ (W[t - 15] >>> 3);
            const gamma1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^ ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^ (W[t - 2] >>> 10);
            W[t] = (W[t - 16] + gamma0 + W[t - 7] + gamma1) | 0;
        }

        let [a, b, c, d, e, f, g, h] = H;

        for (let t = 0; t < 64; t++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) | 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) | 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) | 0;
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

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
    return out;
}

function sha256Hex(str) {
    const bytes = sha256(str);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return hex;
}

// ==========================================
// 3. MOTOR AES-256-CBC PURO (Zero Dependencies)
// ==========================================
const SBOX = new Uint8Array([
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

const INV_SBOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;

const RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function gmult(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        let hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return p;
}

function keyExpansion256(key) {
    const w = new Uint32Array(60);
    for (let i = 0; i < 8; i++) {
        w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    }
    for (let i = 8; i < 60; i++) {
        let temp = w[i - 1];
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
    let state = new Uint8Array(16);
    state.set(block);

    function addRoundKey(rnd) {
        for (let c = 0; c < 4; c++) {
            const word = w[rnd * 4 + c];
            state[c * 4 + 0] ^= (word >>> 24) & 0xff;
            state[c * 4 + 1] ^= (word >>> 16) & 0xff;
            state[c * 4 + 2] ^= (word >>> 8) & 0xff;
            state[c * 4 + 3] ^= word & 0xff;
        }
    }

    addRoundKey(14);

    for (let round = 13; round >= 1; round--) {
        // InvShiftRows
        let t1 = state[13], t2 = state[10], t3 = state[7];
        state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1;
        let t = state[2]; state[2] = state[10]; state[10] = t;
        t = state[6]; state[6] = state[14]; state[14] = t;
        let t4 = state[3];
        state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t4;

        // InvSubBytes
        for (let i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];

        addRoundKey(round);

        // InvMixColumns
        for (let c = 0; c < 4; c++) {
            let s0 = state[c * 4], s1 = state[c * 4 + 1], s2 = state[c * 4 + 2], s3 = state[c * 4 + 3];
            state[c * 4 + 0] = gmult(s0, 0x0e) ^ gmult(s1, 0x0b) ^ gmult(s2, 0x0d) ^ gmult(s3, 0x09);
            state[c * 4 + 1] = gmult(s0, 0x09) ^ gmult(s1, 0x0e) ^ gmult(s2, 0x0b) ^ gmult(s3, 0x0d);
            state[c * 4 + 2] = gmult(s0, 0x0d) ^ gmult(s1, 0x09) ^ gmult(s2, 0x0e) ^ gmult(s3, 0x0b);
            state[c * 4 + 3] = gmult(s0, 0x0b) ^ gmult(s1, 0x0d) ^ gmult(s2, 0x09) ^ gmult(s3, 0x0e);
        }
    }

    // InvShiftRows
    let t1 = state[13];
    state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t1;
    let t = state[2]; state[2] = state[10]; state[10] = t;
    t = state[6]; state[6] = state[14]; state[14] = t;
    let t4 = state[3];
    state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t4;

    // InvSubBytes
    for (let i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];

    addRoundKey(0);

    return state;
}

function decryptAES(encryptedBase64, aesKeyBytes) {
    try {
        const raw = decodeB64ToBytes(encryptedBase64);
        if (raw.length < 32 || raw.length % 16 !== 0) return null;

        const iv = raw.slice(0, 16);
        const ciphertext = raw.slice(16);
        const w = keyExpansion256(aesKeyBytes);
        const decrypted = new Uint8Array(ciphertext.length);

        for (let i = 0; i < ciphertext.length; i += 16) {
            const block = ciphertext.slice(i, i + 16);
            const invBlock = invCipherBlock(block, w);
            const prevBlock = i === 0 ? iv : ciphertext.slice(i - 16, i);
            for (let j = 0; j < 16; j++) {
                decrypted[i + j] = invBlock[j] ^ prevBlock[j];
            }
        }

        // PKCS#7 Unpadding
        const pad = decrypted[decrypted.length - 1];
        if (pad < 1 || pad > 16) return null;
        for (let i = decrypted.length - pad; i < decrypted.length; i++) {
            if (decrypted[i] !== pad) return null;
        }

        return utf8BytesToString(decrypted.slice(0, decrypted.length - pad));
    } catch {
        return null;
    }
}

// ==========================================
// 4. DESEMPAQUETADOR DEAN EDWARDS (HERMES)
// ==========================================
function unpackJS(packed) {
    try {
        const regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        const match = packed.match(regex);
        if (!match) return null;

        let [, p, a, , k] = match;
        p = p.slice(1, -1);
        const words = k.split("|");
        const radix = parseInt(a, 10);

        const unbase = (val, base) => {
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (base <= 36) return parseInt(val, base);
            let res = 0;
            for (let i = 0; i < val.length; i++) res = res * base + chars.indexOf(val[i]);
            return res;
        };

        return p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch {
        return null;
    }
}

// ==========================================
// 5. RESOLVERS INDIVIDUALES
// ==========================================
async function resolveVidHide(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": "https://sololatino.net/" },
            redirect: "follow"
        });
        const html = await res.text();

        const direct = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (direct) return { url: direct[1], quality: "1080p", server: "VidHide" };

        const unpacked = unpackJS(html);
        if (unpacked) {
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);
            if (m3u8) return { url: m3u8[0].replace(/\\/g, ""), quality: "1080p", server: "VidHide" };
        }
        return null;
    } catch {
        return null;
    }
}

async function resolveStreamWish(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": url },
            redirect: "follow"
        });
        const html = await res.text();

        const fileMatch = html.match(/(?:file|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (fileMatch) return { url: fileMatch[1], quality: "1080p", server: "StreamWish" };

        const unpacked = unpackJS(html);
        if (unpacked) {
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) return { url: m3u8[0], quality: "1080p", server: "StreamWish" };
        }
        return null;
    } catch {
        return null;
    }
}

async function resolveVOE(url, depth = 0) {
    if (depth > 3) return null;
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": "https://sololatino.net/" },
            redirect: "follow"
        });
        const html = await res.text();

        const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
                           html.match(/location\.replace\(['"]([^'"]+)['"]\)/i);
        if (jsRedirect && jsRedirect[1] && jsRedirect[1] !== url) {
            let nextUrl = jsRedirect[1];
            if (nextUrl.startsWith("/")) nextUrl = new URL(url).origin + nextUrl;
            return await resolveVOE(nextUrl, depth + 1);
        }

        const direct = html.match(/'hls'\s*:\s*['"]([^'"]+)['"]/i) || html.match(/"hls"\s*:\s*['"]([^'"]+)['"]/i);
        if (direct) {
            let streamUrl = direct[1];
            if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
            return { url: streamUrl, quality: "1080p", server: "VOE" };
        }
        return null;
    } catch {
        return null;
    }
}

// ==========================================
// 6. TMDB METADATA
// ==========================================
async function getMediaData(tmdbId, mediaType) {
    try {
        const isTv = mediaType === "tv" || mediaType === "series";
        const type = isTv ? "tv" : "movie";
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=external_ids`;
        const res = await fetch(url);
        const data = await res.json();
        return {
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || "").substring(0, 4),
            imdbId: data.external_ids?.imdb_id || data.imdb_id || null
        };
    } catch {
        return null;
    }
}

// ==========================================
// 7. OBTENER Y DESCIFRAR EMBEDS DE EMBED69
// ==========================================
async function fetchAndDecryptEmbed69(targetUrl) {
    try {
        const pageRes = await fetch(targetUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }
        });
        const html = await pageRes.text();

        const challengeMatch = html.match(/const\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/);
        const difficultyMatch = html.match(/const\s+POW_DIFFICULTY\s*=\s*(\d+)/);
        const saltMatch = html.match(/const\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/);
        const dataLinkMatch = html.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/);

        if (!challengeMatch || !dataLinkMatch) return [];

        const challenge = challengeMatch[1];
        const difficulty = parseInt(difficultyMatch ? difficultyMatch[1] : "3", 10);
        const salt = saltMatch ? saltMatch[1] : "";
        const dataLink = JSON.parse(dataLinkMatch[1]);

        // Resolver PoW con SHA-256 nativo
        const prefix = "0".repeat(difficulty);
        let nonce = 0;
        while (true) {
            const hash = sha256Hex(challenge + nonce);
            if (hash.startsWith(prefix)) break;
            nonce++;
        }

        // Clave AES pura
        const aesKey = sha256(challenge + nonce + salt);
        const embeds = [];

        for (const file of dataLink) {
            const lang = file.video_language === "LAT" ? "Latino" : file.video_language === "ESP" ? "Castellano" : "Subtitulado";
            if (file.sortedEmbeds) {
                for (const embed of file.sortedEmbeds) {
                    const decryptedUrl = decryptAES(embed.link, aesKey);
                    if (decryptedUrl) {
                        embeds.push({ url: decryptedUrl, server: embed.servername, lang });
                    }
                }
            }
        }
        return embeds;
    } catch {
        return [];
    }
}

// ==========================================
// 8. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return [];
    const streams = [];

    try {
        const media = await getMediaData(tmdbId, mediaType);
        if (!media || !media.imdbId) return [];

        const isTv = mediaType === "tv" || mediaType === "series";
        let embedsToResolve = [];

        if (!isTv) {
            const movieUrl = `${BASE_URL}/f/${media.imdbId}`;
            embedsToResolve = await fetchAndDecryptEmbed69(movieUrl);
        } else {
            const s = parseInt(seasonNum || 1, 10);
            const e = parseInt(episodeNum || 1, 10);
            const epPadded = String(e).padStart(2, "0");

            const urlPadded = `${BASE_URL}/f/${media.imdbId}-${s}x${epPadded}`;
            embedsToResolve = await fetchAndDecryptEmbed69(urlPadded);

            if (embedsToResolve.length === 0) {
                const urlSimple = `${BASE_URL}/f/${media.imdbId}-${s}x${e}`;
                embedsToResolve = await fetchAndDecryptEmbed69(urlSimple);
            }
        }

        if (embedsToResolve.length === 0) return [];

        const resolvePromises = embedsToResolve.map(async (item) => {
            const u = item.url.toLowerCase();
            let res = null;

            if (u.includes("vidhide") || u.includes("minochinos")) {
                res = await resolveVidHide(item.url);
            } else if (u.includes("streamwish") || u.includes("hglink") || u.includes("hlswish")) {
                res = await resolveStreamWish(item.url);
            } else if (u.includes("voe")) {
                res = await resolveVOE(item.url);
            }

            if (res && res.url) {
                return {
                    name: "SoloLatino",
                    title: `${res.quality} · ${res.server} (${item.lang})`,
                    url: res.url,
                    quality: res.quality,
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": item.url
                    }
                };
            }
            return null;
        });

        const results = await Promise.allSettled(resolvePromises);
        for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
                streams.push(r.value);
            }
        }

        return streams;
    } catch {
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
