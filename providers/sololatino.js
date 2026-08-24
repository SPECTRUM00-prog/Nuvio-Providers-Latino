/**
 * Plugin de SoloLatino (Películas y Series) para Nuvio Media Hub
 * Soporte para VidHide, StreamWish y VOE en Español Latino, Castellano y Subtitulado.
 * Compatible con Android TV y FireTV (Hermes Engine - Zero Dependencies).
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://embed69.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// 1. DECODIFICADORES PUROS
function decodeB64ToBytes(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let str = String(b64).replace(/[=]+$/, "");
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

// 2. CRYPTO NATIVO (PoW & AES-CBC)
async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return new Uint8Array(hash);
}

async function decryptAES(encryptedBase64, aesKeyBytes) {
    try {
        const raw = decodeB64ToBytes(encryptedBase64);
        const iv = raw.slice(0, 16);
        const ciphertext = raw.slice(16);
        const key = await crypto.subtle.importKey("raw", aesKeyBytes.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    } catch {
        return null;
    }
}

// 3. DESEMPAQUETADOR DEAN EDWARDS (VidHide / StreamWish)
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

// 4. RESOLVERS DE SERVIDORES INDIVIDUALES
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

// 5. TMDB METADATA
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

// 6. OBTENER Y DESCIFRAR EMBEDS DE EMBED69
async function fetchAndDecryptEmbed69(targetUrl) {
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

    const prefix = "0".repeat(difficulty);
    let nonce = 0;
    while (true) {
        const hash = await sha256Hex(challenge + nonce);
        if (hash.startsWith(prefix)) break;
        nonce++;
    }

    const aesKey = await sha256Bytes(challenge + nonce + salt);
    const embeds = [];

    for (const file of dataLink) {
        const lang = file.video_language === "LAT" ? "Latino" : file.video_language === "ESP" ? "Castellano" : "Subtitulado";
        if (file.sortedEmbeds) {
            for (const embed of file.sortedEmbeds) {
                const decryptedUrl = await decryptAES(embed.link, aesKey);
                if (decryptedUrl) {
                    embeds.push({ url: decryptedUrl, server: embed.servername, lang });
                }
            }
        }
    }
    return embeds;
}

// 7. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return [];
    const streams = [];

    try {
        const media = await getMediaData(tmdbId, mediaType);
        if (!media || !media.imdbId) return [];

        const isTv = mediaType === "tv" || mediaType === "series";
        let embedsToResolve = [];

        if (!isTv) {
            // Películas
            const movieUrl = `${BASE_URL}/f/${media.imdbId}`;
            embedsToResolve = await fetchAndDecryptEmbed69(movieUrl);
        } else {
            // Series: intentamos formatos comunes (ej: tt0903747-1x01 o tt0903747-1x1)
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

        // Resolver servidores en paralelo
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
