/**
 * Plugin de SoloLatino (Motor SLPLAYER / Debug Mode) para Nuvio
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

async function resolveVOE(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": url }, redirect: "follow" });
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

async function resolveStreamWish(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": url }, redirect: "follow" });
        const html = await res.text();
        const fileMatch = html.match(/file\s*:\s*["']([^"']+)["']/i);
        if (fileMatch) return { url: fileMatch[1], quality: "1080p", server: "StreamWish" };
        return null;
    } catch {
        return null;
    }
}

async function resolveVidHide(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": url }, redirect: "follow" });
        const html = await res.text();
        const rawMatch = html.match(/"hls[24]"\s*:\s*"([^"]+)"/) || html.match(/file\s*:\s*["']([^"']+)["']/i);
        if (rawMatch) {
            let finalUrl = rawMatch[1];
            if (!finalUrl.startsWith("http")) finalUrl = new URL(url).origin + finalUrl;
            return { url: finalUrl, quality: "1080p", server: "VidHide" };
        }
        return null;
    } catch {
        return null;
    }
}

function extractDecodedEmbeds(html) {
    const embeds = [];
    const regexDirect = /https?:\/\/[^"'\s<>]+(?:minochinos|vidhide|streamwish|hlswish|hglink|hanerix|voe\.sx|johnbeyondnation)[^"'\s<>]*/gi;
    let m;
    while ((m = regexDirect.exec(html)) !== null) {
        if (!embeds.some(e => e.url === m[0])) {
            embeds.push({ url: m[0], server: "Servidor", lang: "Latino" });
        }
    }
    return embeds;
}

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

        console.log(`[SoloLatino] Consultando SLPlayer: ${targetUrl}`);

        const pageRes = await fetch(targetUrl, { headers: HEADERS });
        const html = await pageRes.text();

        // LÍNEAS DE DEPURACIÓN
        console.log(`[Debug] Código HTTP: ${pageRes.status} ${pageRes.statusText}`);
        console.log(`[Debug] Fragmento recibido:\n${html.substring(0, 200)}...\n`);

        const embeds = extractDecodedEmbeds(html);
        console.log(`[SoloLatino] Reproductores detectados: ${embeds.length}`);

        const resolvePromises = embeds.map(async (item) => {
            const u = item.url.toLowerCase();
            let res = null;
            if (u.includes("voe") || u.includes("johnbeyondnation")) res = await resolveVOE(item.url);
            else if (u.includes("streamwish") || u.includes("hlswish") || u.includes("hglink") || u.includes("hanerix")) res = await resolveStreamWish(item.url);
            else if (u.includes("vidhide") || u.includes("minochinos")) res = await resolveVidHide(item.url);

            if (res && res.url) {
                return {
                    name: "SoloLatino",
                    title: `${res.quality} · ${res.server} (${item.lang})`,
                    url: res.url,
                    quality: res.quality,
                    headers: { "User-Agent": USER_AGENT, "Referer": item.url }
                };
            }
            return null;
        });

        const results = await Promise.allSettled(resolvePromises);
        for (const r of results) {
            if (r.status === "fulfilled" && r.value) streams.push(r.value);
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
