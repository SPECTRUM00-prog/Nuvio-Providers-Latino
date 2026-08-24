/**
 * Plugin de SoloLatino (VidHide / StreamWish / VOE) para Nuvio
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

// 2. EXTRACTOR VIDHIDE / MINOCHINOS (PROBADO Y FUNCIONAL)
async function resolveVidHide(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": "https://sololatino.net/" },
            redirect: "follow"
        });
        const html = await res.text();

        const match = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
        if (!match) return null;

        const [, p, a, , k] = match;
        const words = k.split("|");
        const radix = parseInt(a, 10);

        const unpacked = p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = parseInt(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });

        const m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i) ||
                          unpacked.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i);

        if (m3u8Match) {
            return {
                url: m3u8Match[0].replace(/\\/g, ""),
                quality: "1080p",
                server: "VidHide"
            };
        }
        return null;
    } catch {
        return null;
    }
}

// EXTRACTOR STREAMWISH
async function resolveStreamWish(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": url },
            redirect: "follow"
        });
        const html = await res.text();

        const fileMatch = html.match(/file\s*:\s*["']([^"']+)["']/i);
        if (fileMatch) return { url: fileMatch[1], quality: "1080p", server: "StreamWish" };

        const packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            const [, p, a, , k] = packMatch;
            const words = k.split("|");
            const radix = parseInt(a, 10);
            const unpacked = p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
                const idx = parseInt(token, radix);
                return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
            });
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
            if (m3u8) return { url: m3u8[0], quality: "1080p", server: "StreamWish" };
        }
        return null;
    } catch {
        return null;
    }
}

// EXTRACTOR VOE
async function resolveVOE(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Referer": url },
            redirect: "follow"
        });
        const html = await res.text();

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
                ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(n => rot = rot.split(n).join(""));
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

// 3. EXTRAER ENLACES DEL DOCUMENTO
function extractDecodedEmbeds(html) {
    const embeds = [];

    // Buscar servidores en iframe o data-src
    const regexDirect = /https?:\/\/[^"'\s<>]+(?:minochinos|vidhide|streamwish|hlswish|hglink|hanerix|voe\.sx|johnbeyondnation)[^"'\s<>]*/gi;
    let directM;
    while ((directM = regexDirect.exec(html)) !== null) {
        if (!embeds.some(e => e.url === directM[0])) {
            embeds.push({
                url: directM[0],
                server: directM[0].includes("minochinos") || directM[0].includes("vidhide") ? "VidHide" :
                        directM[0].includes("voe") || directM[0].includes("johnbeyondnation") ? "VOE" : "StreamWish",
                lang: "Latino"
            });
        }
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

        const isMovie = mediaType === "movie";
        let targetUrl = `${BASE_URL}/f/${media.imdbId}`;
        if (!isMovie) {
            const s = parseInt(seasonNum || 1);
            const e = parseInt(episodeNum || 1);
            const epStr = String(e).padStart(2, "0");
            targetUrl = `${BASE_URL}/f/${media.imdbId}-${s}x${epStr}`;
        }

        console.log(`[SoloLatino] Consultando: ${targetUrl}`);

        const pageRes = await fetch(targetUrl, { headers: HEADERS });
        const html = await pageRes.text();

        const embeds = extractDecodedEmbeds(html);
        console.log(`[SoloLatino] Servidores encontrados: ${embeds.length}`);

        // Resolver todos los servidores en paralelo
        const resolvePromises = embeds.map(async (item) => {
            const u = item.url.toLowerCase();
            let res = null;

            if (u.includes("vidhide") || u.includes("minochinos") || u.includes("dintezuvio")) {
                res = await resolveVidHide(item.url);
            } else if (u.includes("voe") || u.includes("johnbeyondnation") || u.includes("marissashare")) {
                res = await resolveVOE(item.url);
            } else if (u.includes("streamwish") || u.includes("hlswish") || u.includes("hglink") || u.includes("hanerix")) {
                res = await resolveStreamWish(item.url);
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
    } catch (error) {
        console.error("[SoloLatino] Error general:", error.message);
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
