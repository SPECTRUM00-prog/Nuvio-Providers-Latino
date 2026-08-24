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

// Convertir títulos a Slugs para URLs
function slugify(text) {
    return text.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
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

// 2. EXTRACTORES DE VIDEO
// Extractor VOE
async function resolveVOE(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: url } });
        const html = await res.text();

        // Buscar enlaces directos en HLS o MP4
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

// Extractor StreamWish / HLSWish
async function resolveStreamWish(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: "https://streamwish.to/" } });
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

// 3. EXTRAER ENLACES BASE64 DEL HTML DE CINECALIDAD
function extractEmbedUrls(html) {
    const rawMatches = [];
    const regex = /data-src="([A-Za-z0-9+/=]{20,})"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        rawMatches.push(match[1]);
    }

    return [...new Set(rawMatches.map(decodeB64).filter(u => u && u.startsWith("http")))];
}

// 4. FUNCIÓN PRINCIPAL DE NUVIO
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

        // Posibles slugs para la URL de CineCalidad
        const slugCandidates = [
            slugify(tmdbData.title),
            `${slugify(tmdbData.title)}-2`,
            tmdbData.originalTitle ? slugify(tmdbData.originalTitle) : null
        ].filter(Boolean);

        let movieHtml = null;

        for (const slug of slugCandidates) {
            const pageUrl = `${SITE_URL}/pelicula/${slug}/`;
            try {
                const res = await fetch(pageUrl, { headers: HEADERS });
                if (res.ok) {
                    movieHtml = await res.text();
                    console.log(`[CineCalidad] Encontrado: ${pageUrl}`);
                    break;
                }
            } catch {}
        }

        if (!movieHtml) {
            console.log("[CineCalidad] No se encontró la película por slug.");
            return [];
        }

        const embedUrls = extractEmbedUrls(movieHtml);
        console.log(`[CineCalidad] Embeds encontrados: ${embedUrls.length}`);

        // Resolver todos los servidores en paralelo
        const resolvePromises = embedUrls.map(async (url) => {
            if (url.includes("voe.sx")) return await resolveVOE(url);
            if (url.includes("vimeos")) return await resolveVimeos(url);
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
