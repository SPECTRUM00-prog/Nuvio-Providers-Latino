/**
 * Plugin de SoloLatino (Motor SLPLAYER) para Nuvio
 * Soporta Películas y Series en Español Latino
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
// Extractor StreamWish / HLSWish
async function resolveStreamWish(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: "https://hlswish.com/" } });
        const html = await res.text();
        const fileMatch = html.match(/file\s*:\s*["']([^"']+)["']/i);
        if (fileMatch) {
            return { url: fileMatch[1], quality: "1080p", server: "StreamWish" };
        }
        return null;
    } catch {
        return null;
    }
}

// Extractor VOE
async function resolveVOE(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: url } });
        const html = await res.text();
        const directMatch = html.match(/(?:mp4|hls)'\s*:\s*'([^']+)'/i) || html.match(/(?:mp4|hls)"\s*:\s*"([^"]+)"/i);
        if (directMatch) {
            let streamUrl = directMatch[1];
            if (streamUrl.startsWith("aHR0")) {
                streamUrl = typeof atob !== "undefined" ? atob(streamUrl) : Buffer.from(streamUrl, "base64").toString("utf8");
            }
            return { url: streamUrl, quality: "1080p", server: "VOE" };
        }
        return null;
    } catch {
        return null;
    }
}

// 3. EXTRAER ENLACES DE SERVIDORES
function extractEmbeds(html) {
    const embeds = [];
    const regex = /https?:\/\/[^"'\s<>]+(?:hlswish|streamwish|strwish|voe\.sx|vidhide)[^"'\s<>]*/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        embeds.push(match[0]);
    }
    return [...new Set(embeds)];
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

        console.log(`[SoloLatino] Conectando a SLPlayer: ${targetUrl}`);

        const pageRes = await fetch(targetUrl, { headers: HEADERS });
        const html = await pageRes.text();

        const embedUrls = extractEmbeds(html);
        console.log(`[SoloLatino] Embeds encontrados: ${embedUrls.length}`);

        // Resolver todos los servidores en paralelo
        const resolvePromises = embedUrls.map(async (url) => {
            if (url.includes("voe.sx")) return await resolveVOE(url);
            if (url.includes("streamwish") || url.includes("hlswish") || url.includes("strwish")) return await resolveStreamWish(url);
            return null;
        });

        const results = await Promise.allSettled(resolvePromises);
        for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
                const data = r.value;
                streams.push({
                    name: "SoloLatino",
                    title: `${data.quality} · SLPlayer (${data.server})`,
                    url: data.url,
                    quality: data.quality,
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": `${BASE_URL}/`
                    }
                });
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
