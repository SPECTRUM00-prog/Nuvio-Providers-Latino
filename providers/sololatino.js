/**
 * Plugin de SoloLatino para Nuvio
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const SITE_URL = "https://sololatino.net";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "es-MX,es;q=0.9",
    "Referer": `${SITE_URL}/`
};

// 1. OBTENER INFORMACIÓN DE TMDB
async function getTMDBInfo(tmdbId, mediaType) {
    try {
        const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=external_ids`;
        const res = await fetch(url);
        const data = await res.json();
        
        return {
            title: data.title || data.name,
            originalTitle: data.original_title || data.original_name,
            year: (data.release_date || data.first_air_date || "").substring(0, 4),
            imdbId: data.external_ids?.imdb_id || null
        };
    } catch (e) {
        console.error("[SoloLatino] Error TMDB:", e.message);
        return null;
    }
}

// 2. BUSCADOR EN LA API DE SOLOLATINO
async function searchSoloLatino(query) {
    try {
        const searchUrl = `${SITE_URL}/api/search/suggest?q=${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl, { headers: HEADERS });
        const results = await res.json();
        return Array.isArray(results) ? results : [];
    } catch (e) {
        console.error("[SoloLatino] Error en buscador:", e.message);
        return [];
    }
}

// 3. EXTRAER ENLACE DEL REPRODUCTOR (IFRAME / P.PHP)
async function extractPlayerStream(pageUrl) {
    try {
        const res = await fetch(pageUrl, { headers: HEADERS });
        const html = await res.text();

        // Buscar el iframe de player.peliserieshoy.com
        const iframeMatch = html.match(/<iframe[^>]+src="([^"]+player\.peliserieshoy\.com[^"]*)"/i) ||
                            html.match(/<iframe[^>]+src="([^"]+)"/i);

        if (!iframeMatch) return null;

        let iframeUrl = iframeMatch[1];
        if (iframeUrl.startsWith("//")) iframeUrl = `https:${iframeUrl}`;

        // Cargar el iframe para extraer el video /p.php
        const iframeRes = await fetch(iframeUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": pageUrl
            }
        });
        const iframeHtml = await iframeRes.text();

        // Extraer src del video
        const videoMatch = iframeHtml.match(/<video[^>]+src="([^"]+)"/i) ||
                           iframeHtml.match(/src:\s*["']([^"']+\/p\.php[^"']*)["']/i) ||
                           iframeHtml.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);

        if (videoMatch) {
            let videoUrl = videoMatch[1];
            if (videoUrl.startsWith("/")) {
                const domainMatch = iframeUrl.match(/^(https?:\/\/[^/]+)/);
                const domain = domainMatch ? domainMatch[1] : "https://player.peliserieshoy.com";
                videoUrl = `${domain}${videoUrl}`;
            }

            return {
                name: "SoloLatino",
                title: "1080p · Player+",
                url: videoUrl,
                quality: "1080p",
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": iframeUrl
                }
            };
        }

        return null;
    } catch (e) {
        console.error("[SoloLatino] Error extrayendo reproductor:", e.message);
        return null;
    }
}

// 4. FUNCIÓN PRINCIPAL PARA NUVIO
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    console.log(`[SoloLatino] Buscando TMDB: ${tmdbId} (${mediaType})`);
    const streams = [];

    try {
        const tmdbData = await getTMDBInfo(tmdbId, mediaType);
        if (!tmdbData) return [];

        console.log(`[SoloLatino] Título: "${tmdbData.title}" (${tmdbData.year})`);

        // 1. Buscar coincidencia en SoloLatino
        let results = await searchSoloLatino(tmdbData.title);
        if (!results.length && tmdbData.originalTitle) {
            results = await searchSoloLatino(tmdbData.originalTitle);
        }

        if (!results.length) {
            console.log("[SoloLatino] No se encontraron resultados en el buscador.");
            return [];
        }

        const match = results[0];
        console.log(`[SoloLatino] Encontrado: "${match.title}" -> ${match.url}`);

        // 2. Extraer stream del reproductor
        const stream = await extractPlayerStream(match.url);
        if (stream) {
            streams.push(stream);
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
