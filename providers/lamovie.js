/**
 * Plugin de LaMovie para Nuvio
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const SITE_URL = "https://lamovie.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 1. OBTENER INFORMACIÓN DE TMDB
async function getTMDBInfo(tmdbId, mediaType) {
    try {
        const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`;
        const res = await fetch(url);
        const data = await res.json();
        
        return {
            title: mediaType === "movie" ? data.title : data.name,
            originalTitle: mediaType === "movie" ? data.original_title : data.original_name,
            year: (data.release_date || data.first_air_date || "").substring(0, 4)
        };
    } catch (e) {
        console.error("[Plugin] Error obteniendo TMDB:", e.message);
        return null;
    }
}

// 2. BUSCADOR EN LA API DE LAMOVIE
async function searchMedia(query) {
    try {
        const searchUrl = `${SITE_URL}/wp-api/v1/search?postType=any&q=${encodeURIComponent(query)}&postsPerPage=5`;
        const res = await fetch(searchUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json"
            }
        });
        const json = await res.json();
        return json?.data?.posts || [];
    } catch (e) {
        console.error("[Plugin] Error en buscador:", e.message);
        return [];
    }
}

// 3. EXTRACTOR / RESOLVER DE VIMEOS (HLS .m3u8)
async function resolveVimeos(embedUrl) {
    try {
        const res = await fetch(embedUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://vimeos.net/"
            }
        });
        const html = await res.text();

        // Desempaquetador de la función eval(...) de Vimeos
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

            const unpacked = p.replace(/\b(\w+)\b/g, (token) => {
                const idx = decodeNum(token);
                return words[idx] || token;
            });

            // Extraer la URL .m3u8 del script desempaquetado
            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1],
                    quality: "1080p",
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": "https://vimeos.net/"
                    }
                };
            }
        }
        return null;
    } catch (e) {
        console.error("[Plugin] Error resolviendo Vimeos:", e.message);
        return null;
    }
}

// 4. FUNCIÓN PRINCIPAL PARA NUVIO
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    console.log(`[Plugin] Buscando en LaMovie para TMDB: ${tmdbId} (${mediaType})`);
    const streams = [];

    try {
        const tmdbData = await getTMDBInfo(tmdbId, mediaType);
        if (!tmdbData) return [];

        console.log(`[Plugin] TMDB: "${tmdbData.title}" (${tmdbData.year})`);

        // Buscar primero por el título en español latino, si no por el original
        let posts = await searchMedia(tmdbData.title);
        if (!posts.length && tmdbData.originalTitle) {
            posts = await searchMedia(tmdbData.originalTitle);
        }

        if (!posts.length) {
            console.log("[Plugin] No se encontraron resultados en LaMovie");
            return [];
        }

        const item = posts[0];
        const postId = item._id || item.id;
        console.log(`[Plugin] Post encontrado: "${item.title}" (ID: ${postId})`);

        // Obtener los servidores del reproductor
        const playerRes = await fetch(`${SITE_URL}/wp-api/v1/player?postId=${postId}&demo=0`, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json"
            }
        });
        const playerData = await playerRes.json();
        const embeds = playerData?.data?.embeds || [];

        console.log(`[Plugin] Embeds encontrados: ${embeds.length}`);

        // Procesar y resolver cada embed
        for (const embed of embeds) {
            if (embed.url && embed.url.includes("vimeos")) {
                console.log(`[Plugin] Resolviendo servidor: ${embed.url}`);
                const streamData = await resolveVimeos(embed.url);
                if (streamData) {
                    streams.push({
                        name: "LaMovie",
                        title: `${streamData.quality} · Vimeos`,
                        url: streamData.url,
                        quality: streamData.quality,
                        headers: streamData.headers
                    });
                }
            }
        }

        return streams;
    } catch (error) {
        console.error("[Plugin] Error general:", error.message);
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
