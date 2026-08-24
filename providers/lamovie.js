/**
 * Plugin de LaMovie (Películas y Series) para Nuvio Media Hub
 * Compatible con Android TV y FireTV (Hermes Engine - Zero Dependencies)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const FAST_API = "https://lamovie.org/wp-api/v1";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// 1. DESEMPAQUETADOR UNIVERSAL DEAN EDWARDS (Base 62 / 36)
function unpackJS(packed) {
    try {
        const regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        const match = packed.match(regex);
        if (!match) return null;

        let [, p, a, , k] = match;
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

        return p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch {
        return null;
    }
}

// 2. RESOLVERS DE SERVIDORES
async function resolveVimeos(embedUrl) {
    try {
        const res = await fetch(embedUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
        });
        const html = await res.text();

        const unpacked = unpackJS(html);
        if (unpacked) {
            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) ||
                              unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1].replace(/\\/g, ""),
                    quality: "1080p",
                    server: "Vimeos",
                    headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
                };
            }
        }
        return null;
    } catch {
        return null;
    }
}

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

        const unpacked = unpackJS(html);
        if (unpacked) {
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                return {
                    url: m3u8[0],
                    quality: "1080p",
                    server: "StreamWish",
                    headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
                };
            }
        }
        return null;
    } catch {
        return null;
    }
}

async function resolveGoodStream(embedUrl) {
    try {
        const res = await fetch(embedUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" }
        });
        const html = await res.text();

        const unpacked = unpackJS(html);
        if (unpacked) {
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                return {
                    url: m3u8[0],
                    quality: "1080p",
                    server: "GoodStream",
                    headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" }
                };
            }
        }
        return null;
    } catch {
        return null;
    }
}

// 3. TMDB METADATA
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
    } catch {
        return null;
    }
}

// 4. BUSCADOR REST
async function searchMedia(query) {
    try {
        const searchUrl = `${FAST_API}/search?postType=any&q=${encodeURIComponent(query)}&postsPerPage=5`;
        const res = await fetch(searchUrl, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const json = await res.json();
        return json?.data?.posts || json?.posts || [];
    } catch {
        return [];
    }
}

// 5. OBTENER EMBEDS (PELÍCULA O EPISODIO)
async function getPlayerEmbeds(postItem, seasonNum, episodeNum, isTv) {
    const mainId = postItem._id || postItem.id;

    if (!isTv) {
        // Película: Consulta directa por Post ID
        const res = await fetch(`${FAST_API}/player?postId=${mainId}&demo=0`, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const json = await res.json();
        return json?.data?.embeds || json?.embeds || [];
    }

    // Serie: Obtener lista de episodios de la temporada
    const s = parseInt(seasonNum || 1, 10);
    const e = parseInt(episodeNum || 1, 10);
    const epListUrl = `${FAST_API}/single/episodes/list?_id=${mainId}&season=${s}&page=1&postsPerPage=50`;

    try {
        const epRes = await fetch(epListUrl, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const epJson = await epRes.json();
        const posts = epJson?.data?.posts || epJson?.posts || [];

        // Buscar el episodio que coincida con el número solicitado
        let targetEpisode = posts.find(ep => parseInt(ep.episode || ep.episode_number || ep.number, 10) === e);
        
        // Fallback: si no viene el campo de número, tomar por posición en el arreglo
        if (!targetEpisode && posts[e - 1]) {
            targetEpisode = posts[e - 1];
        }

        if (targetEpisode) {
            const epId = targetEpisode._id || targetEpisode.id;
            const pRes = await fetch(`${FAST_API}/player?postId=${epId}&demo=0`, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const pJson = await pRes.json();
            return pJson?.data?.embeds || pJson?.embeds || [];
        }
    } catch {}

    return [];
}

// 6. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
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
        console.log(`[LaMovie] Post encontrado: "${item.title}"`);

        const embeds = await getPlayerEmbeds(item, seasonNum, episodeNum, isTv);
        console.log(`[LaMovie] Embeds encontrados: ${embeds.length}`);

        // Resolver servidores en paralelo
        const resolvePromises = embeds.map(async (embed) => {
            let rawUrl = embed.url || embed.link || embed.embed || embed.code || embed.src || "";
            if (!rawUrl) return null;

            if (rawUrl.includes("<iframe")) {
                const srcMatch = rawUrl.match(/src=["']([^"']+)["']/i);
                if (srcMatch) rawUrl = srcMatch[1];
            }

            let streamData = null;
            if (rawUrl.includes("vimeos")) {
                streamData = await resolveVimeos(rawUrl);
            } else if (rawUrl.includes("streamwish") || rawUrl.includes("hglink") || rawUrl.includes("hlswish")) {
                streamData = await resolveStreamWish(rawUrl);
            } else if (rawUrl.includes("goodstream")) {
                streamData = await resolveGoodStream(rawUrl);
            }

            if (streamData && streamData.url) {
                return {
                    name: "LaMovie",
                    title: `${streamData.quality} · ${streamData.server} (${embed.lang || "Latino"})`,
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
