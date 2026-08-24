/**
 * Plugin de LaMovie (Películas y Series) para Nuvio Media Hub
 * Compatible con Android TV y FireTV (Hermes Engine - Zero Dependencies)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const SITE_URL = "https://lamovie.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// 1. TMDB METADATA
async function getTMDBInfo(tmdbId, mediaType) {
    try {
        const isTv = mediaType === "tv" || mediaType === "series";
        const type = isTv ? "tv" : "movie";
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`;
        const res = await fetch(url);
        const data = await res.json();
        
        return {
            title: isTv ? data.name : data.title,
            originalTitle: isTv ? data.original_name : data.original_title,
            year: (data.release_date || data.first_air_date || "").substring(0, 4)
        };
    } catch (e) {
        console.error("[LaMovie] Error TMDB:", e.message);
        return null;
    }
}

// 2. BUSCADOR REST
async function searchMedia(query) {
    try {
        const searchUrl = `${SITE_URL}/wp-api/v1/search?postType=any&q=${encodeURIComponent(query)}&postsPerPage=5`;
        const res = await fetch(searchUrl, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const json = await res.json();
        return json?.data?.posts || [];
    } catch (e) {
        console.error("[LaMovie] Error buscador:", e.message);
        return [];
    }
}

// 3. OBTENER EMBEDS PARA PELÍCULAS O EPISODIOS DE SERIES
async function getPlayerEmbeds(postItem, seasonNum, episodeNum, isTv) {
    const postId = postItem._id || postItem.id;

    if (!isTv) {
        // Película
        const res = await fetch(`${SITE_URL}/wp-api/v1/player?postId=${postId}&demo=0`, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const json = await res.json();
        return json?.data?.embeds || [];
    }

    // Serie: Intentar obtener la ficha completa con temporadas y episodios
    console.log(`[LaMovie] Buscando ficha de serie para S${seasonNum}E${episodeNum}...`);
    try {
        const detailRes = await fetch(`${SITE_URL}/wp-api/v1/post?id=${postId}`, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const detailJson = await detailRes.json();
        const postData = detailJson?.data || {};

        // Buscar en el árbol de seasons / episodes
        const seasons = postData.seasons || postData.temporadas || [];
        const sTarget = parseInt(seasonNum || 1, 10);
        const eTarget = parseInt(episodeNum || 1, 10);

        let episodeId = null;

        for (const season of seasons) {
            const sNum = parseInt(season.season_number || season.number || season.season || 0, 10);
            if (sNum === sTarget) {
                const episodes = season.episodes || season.episodios || [];
                for (const ep of episodes) {
                    const epNum = parseInt(ep.episode_number || ep.number || ep.episode || 0, 10);
                    if (epNum === eTarget) {
                        episodeId = ep._id || ep.id || ep.ID;
                        break;
                    }
                }
            }
        }

        // Si encontramos el ID específico del episodio, pedimos sus reproductores
        if (episodeId) {
            console.log(`[LaMovie] Episodio encontrado (ID: ${episodeId})`);
            const epPlayerRes = await fetch(`${SITE_URL}/wp-api/v1/player?postId=${episodeId}&demo=0`, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const epJson = await epPlayerRes.json();
            if (epJson?.data?.embeds?.length) return epJson.data.embeds;
        }

        // Fallback: pedir reproductor con parámetros season y episode
        const fallbackRes = await fetch(`${SITE_URL}/wp-api/v1/player?postId=${postId}&season=${sTarget}&episode=${eTarget}&demo=0`, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const fallbackJson = await fallbackRes.json();
        return fallbackJson?.data?.embeds || [];

    } catch (e) {
        console.error("[LaMovie] Error extrayendo episodio:", e.message);
        return [];
    }
}

// 4. RESOLVER VIMEOS
async function resolveVimeos(embedUrl) {
    try {
        const res = await fetch(embedUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://vimeos.net/"
            }
        });
        const html = await res.text();

        const match = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (match) {
            const [_, p, a, c, k] = match;
            const radix = parseInt(a, 10);
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

            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) ||
                              unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);

            if (m3u8Match) {
                return {
                    url: m3u8Match[1].replace(/\\/g, ""),
                    quality: "1080p",
                    server: "Vimeos",
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": "https://vimeos.net/"
                    }
                };
            }
        }
        return null;
    } catch {
        return null;
    }
}

// 5. RESOLVER STREAMWISH
async function resolveStreamWish(embedUrl) {
    try {
        const res = await fetch(embedUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
        });
        const html = await res.text();

        const fileMatch = html.match(/(?:file|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (fileMatch) {
            return {
                url: fileMatch[1],
                quality: "1080p",
                server: "StreamWish",
                headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
            };
        }
        return null;
    } catch {
        return null;
    }
}

// 6. FUNCIÓN PRINCIPAL DE NUVIO
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    const isTv = mediaType === "tv" || mediaType === "series";
    console.log(`[LaMovie] Buscando TMDB: ${tmdbId} (${isTv ? `Serie S${seasonNum || 1}E${episodeNum || 1}` : "Película"})`);
    const streams = [];

    try {
        const tmdbData = await getTMDBInfo(tmdbId, mediaType);
        if (!tmdbData) return [];

        console.log(`[LaMovie] TMDB: "${tmdbData.title}" (${tmdbData.year})`);

        let posts = await searchMedia(tmdbData.title);
        if (!posts.length && tmdbData.originalTitle) {
            posts = await searchMedia(tmdbData.originalTitle);
        }

        if (!posts.length) {
            console.log("[LaMovie] No se encontraron resultados.");
            return [];
        }

        const item = posts[0];
        console.log(`[LaMovie] Post encontrado: "${item.title}" (ID: ${item._id || item.id})`);

        const embeds = await getPlayerEmbeds(item, seasonNum, episodeNum, isTv);
        console.log(`[LaMovie] Embeds encontrados: ${embeds.length}`);

        // Resolver todos los embeds
        for (const embed of embeds) {
            // Extraer la URL venga en la propiedad que venga
            let rawUrl = embed.url || embed.link || embed.embed || embed.code || embed.src || "";

            // Si viene en formato iframe HTML (<iframe src="...">)
            if (rawUrl.includes("<iframe")) {
                const srcMatch = rawUrl.match(/src=["']([^"']+)["']/i);
                if (srcMatch) rawUrl = srcMatch[1];
            }

            console.log(`[LaMovie] Procesando embed: ${rawUrl}`);

            let streamData = null;
            if (rawUrl.includes("vimeos")) {
                streamData = await resolveVimeos(rawUrl);
            } else if (rawUrl.includes("streamwish") || rawUrl.includes("hglink") || rawUrl.includes("hlswish")) {
                streamData = await resolveStreamWish(rawUrl);
            }

            if (streamData && streamData.url) {
                streams.push({
                    name: "LaMovie",
                    title: `${streamData.quality} · ${streamData.server} (Latino)`,
                    url: streamData.url,
                    quality: streamData.quality,
                    headers: streamData.headers
                });
            }
        }

        return streams;
    } catch (error) {
        console.error("[LaMovie] Error general:", error.message);
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
