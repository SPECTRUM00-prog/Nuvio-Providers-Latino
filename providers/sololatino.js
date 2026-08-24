/**
 * Plugin de SoloLatino para Nuvio
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://player.pelisserieshoy.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Accept-Language": "es-MX,es;q=0.9",
    "Referer": "https://sololatino.net/"
};

// 1. OBTENER ID DE IMDB DESDE TMDB
async function getImdbId(tmdbId, mediaType) {
    try {
        const type = mediaType === "movie" ? "movie" : "tv";
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.imdb_id || null;
    } catch {
        return null;
    }
}

// 2. EXTRACTORES DE VIDEO
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

// 3. CONSULTAR STREAM DIRECTO
async function getDirectStream(serverId, token, cookie, playerUrl) {
    try {
        const postHeaders = {
            ...HEADERS,
            "Referer": playerUrl,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        };
        if (cookie) postHeaders["cookie"] = cookie;

        const res = await fetch(`${BASE_URL}/s.php`, {
            method: "POST",
            headers: postHeaders,
            body: `a=2&v=${serverId}&tok=${token}`
        });

        const data = await res.json();
        if (data && data.u) {
            let videoUrl = data.u;
            if (data.sig) {
                videoUrl = `${BASE_URL}/p.php?url=${encodeURIComponent(data.u)}&sig=${data.sig}`;
            }
            if (!videoUrl.startsWith("http")) {
                videoUrl = `${BASE_URL}${videoUrl}`;
            }
            return videoUrl;
        }
        return null;
    } catch {
        return null;
    }
}

// 4. FUNCIÓN PRINCIPAL PARA NUVIO
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return [];

    console.log(`[SoloLatino] Buscando TMDB: ${tmdbId} (${mediaType})`);
    const streams = [];

    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (!imdbId) {
            console.log("[SoloLatino] No se encontró IMDb ID");
            return [];
        }

        console.log(`[SoloLatino] IMDb ID: ${imdbId}`);

        const isMovie = mediaType === "movie";
        const s = parseInt(seasonNum || 1);
        const e = parseInt(episodeNum || 1);
        const epStr = e < 10 ? `0${e}` : e;
        const slug = isMovie ? imdbId : `${imdbId}-${s}x${epStr}`;
        const playerUrl = `${BASE_URL}/f/${slug}`;

        console.log(`[SoloLatino] Cargando reproductor: ${playerUrl}`);

        const pageRes = await fetch(playerUrl, { headers: HEADERS });
        const html = await pageRes.text();
        const cookie = pageRes.headers.get("set-cookie") || "";

        const tokenMatch = html.match(/(?:let\s+token|const\s+_t|tok|_t|token)\s*.*['"]([a-f0-9]{32})['"]/);
        if (!tokenMatch) {
            console.log("[SoloLatino] No se encontró token en el reproductor");
            return [];
        }

        const token = tokenMatch[1];
        console.log(`[SoloLatino] Token obtenido: ${token}`);

        const postHeaders = {
            ...HEADERS,
            "Referer": playerUrl,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        };
        if (cookie) postHeaders["cookie"] = cookie;

        // Clic de activación
        await fetch(`${BASE_URL}/s.php`, {
            method: "POST",
            headers: postHeaders,
            body: `a=click&tok=${token}`
        }).catch(() => {});

        // Pausa de 1 segundo obligatoria para validación de sesión
        await new Promise((r) => setTimeout(r, 1000));

        // Obtener lista de servidores
        const scanRes = await fetch(`${BASE_URL}/s.php`, {
            method: "POST",
            headers: postHeaders,
            body: `a=1&tok=${token}`
        });
        const scanData = await scanRes.json();

        const serverList = [];
        if (scanData?.langs_s?.LAT) {
            serverList.push(...scanData.langs_s.LAT.map((srv) => ({ name: srv[0], id: srv[1], lang: "Latino" })));
        }
        if (scanData?.s) {
            serverList.push(...scanData.s.map((srv) => ({ name: srv[0], id: srv[1], lang: "Latino" })));
        }

        // Eliminar duplicados por ID de servidor
        const uniqueServers = Array.from(new Map(serverList.map((s) => [s.id, s])).values());
        console.log(`[SoloLatino] Servidores encontrados: ${uniqueServers.length}`);

        // Resolver servidores en paralelo
        const resolvePromises = uniqueServers.slice(0, 5).map(async (srv) => {
            const rawUrl = await getDirectStream(srv.id, token, cookie, playerUrl);
            if (!rawUrl) return null;

            let finalData = null;
            if (rawUrl.includes("vimeos")) finalData = await resolveVimeos(rawUrl);
            else if (rawUrl.includes("voe.sx")) finalData = await resolveVOE(rawUrl);
            else if (rawUrl.includes("streamwish") || rawUrl.includes("hlswish")) finalData = await resolveStreamWish(rawUrl);
            else {
                finalData = { url: rawUrl, quality: "1080p", server: srv.name };
            }

            if (finalData) {
                return {
                    name: "SoloLatino",
                    title: `${finalData.quality || "1080p"} · ${srv.name}`,
                    url: finalData.url,
                    quality: finalData.quality || "1080p",
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": playerUrl
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
