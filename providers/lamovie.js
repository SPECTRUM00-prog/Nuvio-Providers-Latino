/**
 * Plugin de LaMovie (Películas y Series) para Nuvio Media Hub
 * Compatible con Android TV y FireTV (Hermes Engine - Zero Dependencies)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const SITE_URL = "https://lamovie.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// 1. OBTENER INFORMACIÓN DE TMDB
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

// 2. BUSCADOR EN LA API REST DE LAMOVIE
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
        console.error("[LaMovie] Error buscador:", e.message);
        return [];
    }
}

// 3. OBTENER EMBEDS DEL REPRODUCTOR (PELÍCULAS O EPISODIOS)
async function getPlayerEmbeds(postId, seasonNum, episodeNum, isTv) {
    try {
        let playerUrl = `${SITE_URL}/wp-api/v1/player?postId=${postId}&demo=0`;
        
        if (isTv) {
            const s = parseInt(seasonNum || 1, 10);
            const e = parseInt(episodeNum || 1, 10);
            playerUrl += `&season=${s}&episode=${e}`;
        }

        const res = await fetch(playerUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json"
            }
        });
        const json = await res.json();
        let embeds = json?.data?.embeds || [];

        // Si es serie y no devolvió embeds directamente por parámetros, consultamos la ficha de episodios
        if (isTv && embeds.length === 0) {
            const detailRes = await fetch(`${SITE_URL}/wp-api/v1/post?id=${postId}`, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const detailJson = await detailRes.json();
            const seasons = detailJson?.data?.seasons || [];
            
            const targetSeason = seasons.find(s => parseInt(s.season_number || s.number, 10) === parseInt(seasonNum || 1, 10));
            if (targetSeason && targetSeason.episodes) {
                const targetEpisode = targetSeason.episodes.find(ep => parseInt(ep.episode_number || ep.number, 10) === parseInt(episodeNum || 1, 10));
                if (targetEpisode && (targetEpisode._id || targetEpisode.id)) {
                    const epId = targetEpisode._id || targetEpisode.id;
                    const epPlayerRes = await fetch(`${SITE_URL}/wp-api/v1/player?postId=${epId}&demo=0`, {
                        headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
                    });
                    const epPlayerData = await epPlayerRes.json();
                    embeds = epPlayerData?.data?.embeds || [];
                }
            }
        }

        return embeds;
    } catch (e) {
        console.error("[LaMovie] Error obteniendo embeds:", e.message);
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
            const [_, p, a, , k] = match;
            const radix = parseInt(a, 10);
            const words = k.split("|");
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

            const decodeNum = (val) => {
                let num = 0;
                for (let char of val) num = num * radix + chars.indexOf(char);
                return num;
            };

            const unpacked = p.replace(/\b(\w+)\b/g, (token) => {
                const idx = decodeNum(token);
                return words[idx] || token;
            });

            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1],
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

// 6. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    const isTv = mediaType === "tv" || mediaType === "series";
    console.log(`[LaMovie] Buscando TMDB: ${tmdbId} (${isTv ? "Serie" : "Película"})`);
    const streams = [];

    try {
        const tmdbData = await getTMDBInfo(tmdbId, mediaType);
        if (!tmdbData) return [];

        console.log(`[LaMovie] TMDB: "${tmdbData.title}" (${tmdbData.year})`);

        // 1. Buscar en LaMovie por título en español o título original
        let posts = await searchMedia(tmdbData.title);
        if (!posts.length && tmdbData.originalTitle) {
            posts = await searchMedia(tmdbData.originalTitle);
        }

        if (!posts.length) {
            console.log("[LaMovie] No se encontraron resultados.");
            return [];
        }

        const item = posts[0];
        const postId = item._id || item.id;
        console.log(`[LaMovie] Post encontrado: "${item.title}" (ID: ${postId})`);

        // 2. Obtener lista de servidores/embeds
        const embeds = await getPlayerEmbeds(postId, seasonNum, episodeNum, isTv);
        console.log(`[LaMovie] Embeds encontrados: ${embeds.length}`);

        // 3. Resolver servidores en paralelo
        const resolvePromises = embeds.map(async (embed) => {
            const rawUrl = embed.url || embed.link || "";
            if (!rawUrl) return null;

            let streamData = null;
            if (rawUrl.includes("vimeos")) {
                streamData = await resolveVimeos(rawUrl);
            } else if (rawUrl.includes("streamwish") || rawUrl.includes("hglink") || rawUrl.includes("hlswish")) {
                streamData = await resolveStreamWish(rawUrl);
            }

            if (streamData && streamData.url) {
                return {
                    name: "LaMovie",
                    title: `${streamData.quality} · ${streamData.server} (Latino)`,
                    url: streamData.url,
                    quality: streamData.quality,
                    headers: streamData.headers
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
        console.error("[LaMovie] Error general:", error.message);
        return [];
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
}
