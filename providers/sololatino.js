/**
 * Plugin de SoloLatino (Motor SLPLAYER) para Nuvio
 * Películas y Series en Español Latino / Castellano
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://embed69.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9",
    "Referer": `${BASE_URL}/`
};

// Decodificador Base64 universal
function decodeB64(str) {
    try {
        let clean = str.replace(/-/g, "+").replace(/_/g, "/");
        while (clean.length % 4) clean += "=";
        return typeof atob !== "undefined" ? atob(clean) : Buffer.from(clean, "base64").toString("utf8");
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

// 2. EXTRACTORES DE VIDEO
// Extractor VOE
async function resolveVOE(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: url } });
        const html = await res.text();

        // 1. Intentar leer JSON encriptado de VOE
        const jsonMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
        if (jsonMatch) {
            try {
                let enc = JSON.parse(jsonMatch[1].trim());
                if (Array.isArray(enc)) enc = enc[0];
                let rot = enc.replace(/[a-zA-Z]/g, c => {
                    const code = c.charCodeAt(0);
                    const limit = c <= "Z" ? 90 : 122;
                    return String.fromCharCode(limit >= code + 13 ? code + 13 : code - 13);
                });
                const noise = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
                noise.forEach(n => rot = rot.split(n).join(""));
                const b64 = decodeB64(rot);
                let shifted = "";
                for (let i = 0; i < b64.length; i++) shifted += String.fromCharCode(b64.charCodeAt(i) - 3);
                const decrypted = decodeB64(shifted.split("").reverse().join(""));
                const data = JSON.parse(decrypted);
                if (data && data.source) {
                    return { url: data.source, quality: "1080p", server: "VOE" };
                }
            } catch {}
        }

        // 2. Fallback regex directo
        const directMatch = html.match(/(?:mp4|hls)'\s*:\s*'([^']+)'/i) || html.match(/(?:mp4|hls)"\s*:\s*"([^"]+)"/i);
        if (directMatch) {
            let streamUrl = directMatch[1];
            if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
            return { url: streamUrl, quality: "1080p", server: "VOE" };
        }
        return null;
    } catch {
        return null;
    }
}

// Extractor StreamWish / HLSWish
async function resolveStreamWish(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: "https://hlswish.com/" } });
        const html = await res.text();

        const fileMatch = html.match(/file\s*:\s*["']([^"']+)["']/i);
        if (fileMatch) {
            return { url: fileMatch[1], quality: "1080p", server: "StreamWish" };
        }

        // Desempaquetador eval
        const packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            const [, p, a, , k] = packMatch;
            const radix = parseInt(a);
            const words = k.split("|");
            const baseAlphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            const unbase = (str) => {
                let result = 0;
                for (let i = 0; i < str.length; i++) result = result * radix + baseAlphabet.indexOf(str[i]);
                return result;
            };
            const unpacked = p.replace(/\b([0-9a-zA-Z]+)\b/g, m => words[unbase(m)] || m);
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
            if (m3u8) {
                return { url: m3u8[0], quality: "1080p", server: "StreamWish" };
            }
        }
        return null;
    } catch {
        return null;
    }
}

// Extractor VidHide
async function resolveVidHide(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: url } });
        const html = await res.text();
        const rawMatch = html.match(/"hls[24]"\s*:\s*"([^"]+)"/) || html.match(/file\s*:\s*["']([^"']+)["']/i);
        if (rawMatch) {
            return { url: rawMatch[1], quality: "1080p", server: "VidHide" };
        }
        return null;
    } catch {
        return null;
    }
}

// 3. EXTRAER Y DESCIFRAR LOS ENLACES JWT DE EMBED69
function extractDecodedEmbeds(html) {
    const embeds = [];
    const match = html.match(/let\s+dataLink\s*=\s*((\[[\s\S]*?\])|(\{[\s\S]*?\}))\s*;/);
    if (!match) return [];

    try {
        const rawData = JSON.parse(match[1].replace(/\\\//g, "/"));
        const list = Array.isArray(rawData) ? rawData : Object.values(rawData);

        for (const item of list) {
            const lang = (item.video_language || "").toUpperCase();
            if (lang !== "LAT" && lang !== "ESP") continue;

            const langLabel = lang === "LAT" ? "Latino" : "Castellano";

            if (Array.isArray(item.sortedEmbeds)) {
                for (const embed of item.sortedEmbeds) {
                    let link = embed.link;
                    if (!link) continue;

                    // Si es un token JWT (ej: xxxx.yyyy.zzzz), decodificar la parte 2
                    if (link.includes(".")) {
                        const parts = link.split(".");
                        if (parts.length === 3) {
                            const payload = decodeB64(parts[1]);
                            if (payload) {
                                try {
                                    const parsed = JSON.parse(payload);
                                    link = parsed.link || link;
                                } catch {}
                            }
                        }
                    }

                    if (link.startsWith("http") && !link.includes("/d/")) {
                        embeds.push({
                            url: link,
                            server: embed.servername || "Servidor",
                            lang: langLabel
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error("[SoloLatino] Error analizando dataLink:", e.message);
    }

    return embeds;
}

// 4. FUNCIÓN PRINCIPAL PARA NUVIO
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return [];

    console.log(`[SoloLatino] Buscando TMDB: ${tmdbId} (${mediaType})`);
    const streams = [];

    try {
        const media = await getMediaData(tmdbId, mediaType);
        if (!media || !media.imdbId) {
            console.log("[SoloLatino] No se encontró IMDb ID.");
            return [];
        }

        console.log(`[SoloLatino] "${media.title}" (${media.year}) | IMDb: ${media.imdbId}`);

        // Construir la URL de SLPlayer
        const isMovie = mediaType === "movie";
        let targetUrl = `${BASE_URL}/f/${media.imdbId}`;
        if (!isMovie) {
            const s = parseInt(seasonNum || 1);
            const e = parseInt(episodeNum || 1);
            const epStr = String(e).padStart(2, "0");
            targetUrl = `${BASE_URL}/f/${media.imdbId}-${s}x${epStr}`;
        }

        console.log(`[SoloLatino] Consultando SLPlayer: ${targetUrl}`);

        const pageRes = await fetch(targetUrl, { headers: HEADERS });
        const html = await pageRes.text();

        const embeds = extractDecodedEmbeds(html);
        console.log(`[SoloLatino] Reproductores descifrados: ${embeds.length}`);

        // Resolver servidores en paralelo
        const resolvePromises = embeds.map(async (item) => {
            let res = null;
            if (item.url.includes("voe.sx")) res = await resolveVOE(item.url);
            else if (item.url.includes("streamwish") || item.url.includes("hlswish") || item.url.includes("strwish")) res = await resolveStreamWish(item.url);
            else if (item.url.includes("vidhide")) res = await resolveVidHide(item.url);
            
            if (res && res.url) {
                return {
                    name: "SoloLatino",
                    title: `${res.quality} · ${res.server} (${item.lang})`,
                    url: res.url,
                    quality: res.quality,
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": `${BASE_URL}/`
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
    } catch (error) {
        console.error("[SoloLatino] Error general:", error.message);
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
