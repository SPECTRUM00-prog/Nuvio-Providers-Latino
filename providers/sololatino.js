/**
 * Plugin de SoloLatino (VidHide / StreamWish / VOE) para Nuvio
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://embed69.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function decodeB64(str) {
    if (!str) return null;
    try {
        let clean = str.replace(/-/g, "+").replace(/_/g, "/").trim();
        while (clean.length % 4) clean += "=";
        return typeof atob !== "undefined" ? atob(clean) : Buffer.from(clean, "base64").toString("utf8");
    } catch {
        return null;
    }
}

// Desempaquetador universal para scripts eval(function(p,a,c,k,e,d)...)
function unpackJS(packed) {
    try {
        const regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        const match = packed.match(regex);
        if (!match) return null;

        let [, p, a, , k] = match;
        // Limpiar comillas iniciales y finales de 'p'
        p = p.slice(1, -1);
        const words = k.split("|");
        const radix = parseInt(a, 10);

        const unbase = (val, base) => {
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (base <= 36) return parseInt(val, base);
            let res = 0;
            for (let i = 0; i < val.length; i++) {
                res = res * base + chars.indexOf(val[i]);
            }
            return res;
        };

        const unpacked = p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });

        return unpacked;
    } catch {
        return null;
    }
}

// 1. OBTENER INFORMACIÓN DE TMDB
async function getMediaData(tmdbId, mediaType) {
    try {
        const type = mediaType === "movie" ? "movie" : "tv";
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=external_ids`;
        const res = await fetch(url);
        const data = await res.json();

        return {
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || "").substring(0, 4),
            imdbId: data.external_ids?.imdb_id || data.imdb_id || null
        };
    } catch (e) {
        console.error("[SoloLatino] Error TMDB:", e.message);
        return null;
    }
}

// 2. EXTRACTOR VIDHIDE
async function resolveVidHide(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": url },
            redirect: "follow"
        });
        const html = await res.text();

        // Intento 1: Detección directa en HTML
        let m3u8Match = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (m3u8Match) {
            return { url: m3u8Match[1], quality: "1080p", server: "VidHide" };
        }

        // Intento 2: Desempaquetar script
        const unpacked = unpackJS(html);
        if (unpacked) {
            const matchUnpacked = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);
            if (matchUnpacked) {
                return {
                    url: matchUnpacked[0].replace(/\\/g, ""),
                    quality: "1080p",
                    server: "VidHide"
                };
            }
        }
        return null;
    } catch {
        return null;
    }
}

// 3. EXTRACTOR STREAMWISH
async function resolveStreamWish(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": url },
            redirect: "follow"
        });
        const html = await res.text();

        // Buscar enlaces directos
        const fileMatch = html.match(/(?:file|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (fileMatch) return { url: fileMatch[1], quality: "1080p", server: "StreamWish" };

        // Desempaquetado
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

// 4. EXTRACTOR VOE
async function resolveVOE(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": url },
            redirect: "follow"
        });
        const html = await res.text();

        // VOE suele redirigir mediante scripts inline a /e/XXXX
        const redirectMatch = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
        if (redirectMatch && redirectMatch[1] !== url) {
            return resolveVOE(redirectMatch[1]);
        }

        // Variación 1: Fuente directa o base64 HLS
        const directMatch = html.match(/'hls'\s*:\s*'([^']+)'/i) || html.match(/"hls"\s*:\s*"([^"]+)"/i);
        if (directMatch) {
            let streamUrl = directMatch[1];
            if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
            return { url: streamUrl, quality: "1080p", server: "VOE" };
        }

        // Variación 2: Bloque JSON ofuscado
        const scriptMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
        if (scriptMatch) {
            try {
                let enc = JSON.parse(scriptMatch[1].trim());
                if (Array.isArray(enc)) enc = enc[0];
                let rot = enc.replace(/[a-zA-Z]/g, c => {
                    const code = c.charCodeAt(0);
                    const limit = c <= "Z" ? 90 : 122;
                    return String.fromCharCode(limit >= code + 13 ? code + 13 : code - 13);
                });
                ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(n => (rot = rot.split(n).join("")));
                const b64 = decodeB64(rot);
                if (b64) {
                    let shifted = "";
                    for (let i = 0; i < b64.length; i++) shifted += String.fromCharCode(b64.charCodeAt(i) - 3);
                    const decrypted = decodeB64(shifted.split("").reverse().join(""));
                    const data = JSON.parse(decrypted);
                    if (data && (data.source || data.direct_access_url)) {
                        return { url: data.source || data.direct_access_url, quality: "1080p", server: "VOE" };
                    }
                }
            } catch {}
        }

        return null;
    } catch {
        return null;
    }
}

// 5. EXTRACCIÓN DE ENLACES EMBEBIDOS
function extractDecodedEmbeds(html) {
    const embeds = [];
    // Capturar cualquier iframe src, data-src o URLs de servicios conocidos
    const regex = /(?:https?:)?\/\/[^"'\s<>]+\/(?:e|v|d)\/[a-zA-Z0-9_-]+/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        let fullUrl = match[0];
        if (fullUrl.startsWith("//")) fullUrl = "https:" + fullUrl;

        const lower = fullUrl.toLowerCase();
        let server = null;

        if (lower.includes("vidhide") || lower.includes("minochinos") || lower.includes("dintezuvio")) {
            server = "VidHide";
        } else if (lower.includes("voe") || lower.includes("johnbeyondnation") || lower.includes("marissashare")) {
            server = "VOE";
        } else if (lower.includes("streamwish") || lower.includes("hlswish") || lower.includes("hglink") || lower.includes("hanerix")) {
            server = "StreamWish";
        }

        if (server && !embeds.some(e => e.url === fullUrl)) {
            embeds.push({ url: fullUrl, server, lang: "Latino" });
        }
    }

    return embeds;
}

// 6. FUNCIÓN PRINCIPAL
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return [];

    try {
        const media = await getMediaData(tmdbId, mediaType);
        if (!media || !media.imdbId) return [];

        const isMovie = mediaType === "movie";
        let targetUrl = `${BASE_URL}/f/${media.imdbId}`;
        if (!isMovie) {
            const s = parseInt(seasonNum || 1);
            const e = parseInt(episodeNum || 1);
            const epStr = String(e).padStart(2, "0");
            targetUrl = `${BASE_URL}/f/${media.imdbId}-${s}x${epStr}`;
        }

        const pageRes = await fetch(targetUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept-Language": "es-MX,es;q=0.9",
                "Referer": `${BASE_URL}/`
            }
        });
        const html = await pageRes.text();
        const embeds = extractDecodedEmbeds(html);

        const resolvePromises = embeds.map(async (item) => {
            let res = null;
            if (item.server === "VidHide") res = await resolveVidHide(item.url);
            else if (item.server === "VOE") res = await resolveVOE(item.url);
            else if (item.server === "StreamWish") res = await resolveStreamWish(item.url);

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
        return results
            .filter(r => r.status === "fulfilled" && r.value)
            .map(r => r.value);

    } catch (error) {
        console.error("[SoloLatino] Error:", error.message);
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
