/**
 * Plugin de CineCalidad para Nuvio
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const SITE_URL = "https://www.cinecalidad.am";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9",
    "Referer": `${SITE_URL}/`
};

// Decodificador Base64 universal
function decodeB64(str) {
    try {
        return typeof atob !== "undefined" ? atob(str) : Buffer.from(str, "base64").toString("utf8");
    } catch {
        return null;
    }
}

// 1. OBTENER INFORMACIÓN DE TMDB
async function getTMDBInfo(tmdbId, mediaType) {
    try {
        const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`;
        const res = await fetch(url);
        const data = await res.json();
        
        return {
            title: data.title || data.name,
            originalTitle: data.original_title || data.original_name,
            year: (data.release_date || data.first_air_date || "").substring(0, 4)
        };
    } catch (e) {
        console.error("[CineCalidad] Error TMDB:", e.message);
        return null;
    }
}

// 2. BUSCADOR DE CINECALIDAD (Obtiene el link real /ver-pelicula/...)
async function searchCinecalidad(query) {
    try {
        const searchUrl = `${SITE_URL}/?s=${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl, { headers: HEADERS });
        const html = await res.text();

        // Buscar enlaces que apunten a /ver-pelicula/
        const matches = [];
        const regex = /href="([^"]*\/ver-pelicula\/[^"]+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            matches.push(match[1]);
        }

        return [...new Set(matches)];
    } catch (e) {
        console.error("[CineCalidad] Error en buscador:", e.message);
        return [];
    }
}

// 3. EXTRACTORES DE VIDEO
// Extractor Vimeos
async function resolveVimeos(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: "https://vimeos.net/" } });
        const html = await res.text();
        const match = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (match) {
            const [_, p, a, c, k] = match;
            const radix = parseInt(a);
            const words = k.split("|");
            const baseAlphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

            const decodeNum = (val) => {
                let num = 0;
                for (let char of val) num = num * radix + baseAlphabet.indexOf(char);
                return num;
            };

            const unpacked = p.replace(/\b(\w+)\b/g, (token) => words[decodeNum(token)] || token);
            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                return { url: m3u8Match[1], quality: "1080p", server: "Vimeos" };
            }
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
            return { url: fileMatch[1], quality: "1080p", server: "HLSWish" };
        }
        return null;
    } catch {
        return null;
    }
}

// Extractor GoodStream
async function resolveGoodStream(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: "https://goodstream.one" } });
        const html = await res.text();
        const fileMatch = html.match(/file:\s*"([^"]+)"/);
        if (fileMatch) {
            return { url: fileMatch[1], quality: "1080p", server: "GoodStream" };
        }
        return null;
    } catch {
        return null;
    }
}

// 4. EXTRAER REPRODUCTORES DEL HTML DE LA PELÍCULA
function extractEmbedUrls(html) {
    const rawMatches = [];
    
    // Buscar atributos data-src o enlaces en Base64
    const b64Regex = /(?:data-src|data-url|href)="([A-Za-z0-9+/=]{20,})"/g;
    let match;
    while ((match = b64Regex.exec(html)) !== null) {
        rawMatches.push(match[1]);
    }

    // Decodificar Base64
    const decoded = rawMatches.map(decodeB64).filter(u => u && u.startsWith("http"));

    // Buscar también enlaces directos en texto claro
    const directRegex = /https?:\/\/[^"'\s<>]+(?:vimeos\.net|voe\.sx|goodstream\.one|hlswish\.com|streamwish\.[a-z]+)[^"'\s<>]*/gi;
    while ((match = directRegex.exec(html)) !== null) {
        decoded.push(match[0]);
    }

    return [...new Set(decoded)];
}

// 5. FUNCIÓN PRINCIPAL PARA NUVIO
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (mediaType === "tv") {
        console.log("[CineCalidad] Las series no están soportadas en esta web.");
        return [];
    }

    console.log(`[CineCalidad] Buscando TMDB: ${tmdbId}`);
    const streams = [];

    try {
        const tmdbData = await getTMDBInfo(tmdbId, mediaType);
        if (!tmdbData) return [];

        console.log(`[CineCalidad] Película: "${tmdbData.title}" (${tmdbData.year})`);

        // 1. Buscar en CineCalidad
        let movieUrls = await searchCinecalidad(tmdbData.title);
        if (!movieUrls.length && tmdbData.originalTitle) {
            movieUrls = await searchCinecalidad(tmdbData.originalTitle);
        }

        if (!movieUrls.length) {
            console.log("[CineCalidad] No se encontraron resultados en el buscador.");
            return [];
        }

        const targetUrl = movieUrls[0];
        console.log(`[CineCalidad] Página encontrada: ${targetUrl}`);

        // 2. Cargar la página de la película
        const pageRes = await fetch(targetUrl, { headers: HEADERS });
        const movieHtml = await pageRes.text();

        // 3. Extraer embeds
        const embedUrls = extractEmbedUrls(movieHtml);
        console.log(`[CineCalidad] Embeds encontrados: ${embedUrls.length}`);

        // 4. Resolver todos los servidores en paralelo
        const resolvePromises = embedUrls.map(async (url) => {
            if (url.includes("vimeos")) return await resolveVimeos(url);
            if (url.includes("voe.sx")) return await resolveVOE(url);
            if (url.includes("streamwish") || url.includes("hlswish") || url.includes("strwish")) return await resolveStreamWish(url);
            if (url.includes("goodstream")) return await resolveGoodStream(url);
            return null;
        });

        const results = await Promise.allSettled(resolvePromises);

        for (const res of results) {
            if (res.status === "fulfilled" && res.value) {
                const data = res.value;
                streams.push({
                    name: "CineCalidad",
                    title: `${data.quality} · ${data.server}`,
                    url: data.url,
                    quality: data.quality,
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": `${SITE_URL}/`
                    }
                });
            }
        }

        return streams;
    } catch (error) {
        console.error("[CineCalidad] Error general:", error.message);
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
