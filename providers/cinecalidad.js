/**
 * Plugin de CineCalidad (Películas y Series) para Nuvio Media Hub
 * Arquitectura: API REST JSON Oficial (tmdb.cinecalidad.am)
 * Compatible con Android TV y FireTV (Hermes Engine - 100% Promise Chains)
 */

// ==========================================
// 0. CONFIGURACIÓN
// ==========================================

var TMDB_API_KEY = "";       // Pega aquí tu API key de TMDB (solo se usa para convertir IDs de IMDb/Cinemeta)
var TMDB_API = "https://api.themoviedb.org/3";
var API_BASE = "https://tmdb.cinecalidad.am";
var EMBED_BASE = "https://vimeos.net";
var SITE_REFERER = "https://www.cinecalidad.am/";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var API_TIMEOUT = 6000;      // ms para la API
var EMBED_TIMEOUT = 6000;    // ms para el embed
var PROBE_TIMEOUT = 2500;    // ms para el probe del m3u8
var API_RETRIES = 1;         // reintentos extra en la llamada a la API

var ENABLE_PROBE = false;    // true = consulta el m3u8 para detectar calidad real (una petición extra)
var DEFAULT_QUALITY = "1080p";
var DEBUG = false;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Referer": SITE_REFERER
};

function log() {
    if (DEBUG && typeof console !== "undefined") {
        console.log.apply(console, ["[CineCalidad]"].concat(Array.prototype.slice.call(arguments)));
    }
}

// ==========================================
// 1. HELPERS DE RED Y TIMEOUT (HERMES SAFE)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || API_TIMEOUT;
    var timer;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var opts = Object.assign({}, options || {});
    if (controller) opts.signal = controller.signal;

    var timeout = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            if (controller) {
                try { controller.abort(); } catch (e) {}
            }
            reject(new Error("Timeout"));
        }, limit);
    });

    return Promise.race([fetch(url, opts), timeout]).then(
        function(res) { clearTimeout(timer); return res; },
        function(err) { clearTimeout(timer); throw err; }
    );
}

// Pide JSON con reintentos. Devuelve null si falla o no es 2xx.
function fetchJson(url, retriesLeft) {
    return fetchWithTimeout(url, { headers: DEFAULT_HEADERS }, API_TIMEOUT)
        .then(function(res) {
            if (!res.ok) {
                log("HTTP", res.status, url);
                return null;
            }
            return res.json();
        })
        .catch(function(err) {
            log("fetchJson error", url, err && err.message);
            if (retriesLeft > 0) return fetchJson(url, retriesLeft - 1);
            return null;
        });
}

// ==========================================
// 2. DESEMPAQUETADOR DEAN EDWARDS
// ==========================================

function unpackJS(packed) {
    try {
        if (!packed || packed.indexOf("eval(function(p,a,c,k,e,") === -1) return null;

        var regex = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/;
        var match = packed.match(regex);
        if (!match) return null;

        var p = match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        var radix = parseInt(match[2], 10);
        var words = match[4].split("|");

        var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var unbase = function(val, base) {
            if (base <= 36) return parseInt(val, base);
            var res = 0;
            for (var i = 0; i < val.length; i++) res = res * base + chars.indexOf(val[i]);
            return res;
        };

        return p.replace(/\b[0-9a-zA-Z]+\b/g, function(token) {
            var idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch (e) {
        log("unpackJS error", e && e.message);
        return null;
    }
}

// ==========================================
// 3. DETECCIÓN DINÁMICA DE CALIDAD REAL
// ==========================================

var QUALITY_MAPS = {
    vimeos: { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" }
};
var QUALITY_ORDER = ["x", "o", "h", "n", "l"];

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();

    if (u.indexOf("vimeos") !== -1) {
        var urlsetMatch = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            for (var i = 0; i < QUALITY_ORDER.length; i++) {
                var tag = QUALITY_ORDER[i];
                if (tags.indexOf(tag) !== -1 && QUALITY_MAPS.vimeos[tag]) {
                    return QUALITY_MAPS.vimeos[tag];
                }
            }
        }
    }

    // Límites de palabra para evitar falsos positivos con tokens/hashes
    if (/(^|[^a-z0-9])(4k|2160p?)([^a-z0-9]|$)/.test(u)) return "4K";
    if (/(^|[^a-z0-9])1080p?([^a-z0-9]|$)/.test(u)) return "1080p";
    if (/(^|[^a-z0-9])720p?([^a-z0-9]|$)/.test(u)) return "720p";
    if (/(^|[^a-z0-9])480p?([^a-z0-9]|$)/.test(u)) return "480p";
    return null;
}

function probeM3u8Quality(m3u8Url, headers) {
    var fastQ = detectQualityFromUrl(m3u8Url);
    if (fastQ) return Promise.resolve(fastQ);

    if (!ENABLE_PROBE) return Promise.resolve(DEFAULT_QUALITY);
    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, PROBE_TIMEOUT)
    .then(function(res) { return res.ok ? res.text() : ""; })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) return "720p";

        var maxH = 0;
        var resRegex = /RESOLUTION=\d+x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var h = parseInt(match[1], 10);
            if (h > maxH) maxH = h;
        }

        if (maxH >= 2160) return "4K";
        if (maxH >= 1080) return "1080p";
        if (maxH >= 720) return "720p";
        if (maxH >= 480) return "480p";
        return "720p";
    })
    .catch(function(err) {
        log("probe error", err && err.message);
        return "720p";
    });
}

// ==========================================
// 4. RESOLVER DE VIMEOS (HLS DIRECTO)
// ==========================================

function normalizeStreamUrl(url) {
    if (!url) return null;
    url = url.replace(/\\/g, "");
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return null;
    return url;
}

function resolveVimeos(fileCode) {
    if (!fileCode) return Promise.resolve(null);
    var embedUrl = EMBED_BASE + "/embed-" + encodeURIComponent(fileCode) + ".html";
    var headers = { "User-Agent": USER_AGENT, "Referer": EMBED_BASE + "/" };

    return fetchWithTimeout(embedUrl, { headers: headers }, EMBED_TIMEOUT)
    .then(function(res) {
        if (!res.ok) {
            log("embed HTTP", res.status);
            return null;
        }
        return res.text();
    })
    .then(function(html) {
        if (!html) return null;

        var streamUrl = null;
        var unpacked = unpackJS(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) ||
                            unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }
        if (!streamUrl) {
            var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) streamUrl = direct[1];
        }

        streamUrl = normalizeStreamUrl(streamUrl);
        if (!streamUrl) {
            log("no se encontró m3u8 en el embed");
            return null;
        }

        return probeM3u8Quality(streamUrl, headers).then(function(q) {
            return {
                url: streamUrl,
                quality: q,
                server: "Vimeos",
                headers: headers
            };
        });
    })
    .catch(function(err) {
        log("resolveVimeos error", err && err.message);
        return null;
    });
}

// ==========================================
// 5. EXTRACTOR VÍA API DE CINECALIDAD LITE
// ==========================================

function fetchFileCode(tmdbId, isTv, seasonNum, episodeNum) {
    var id = encodeURIComponent(tmdbId);

    if (!isTv) {
        // Película: /v1/items/movie/{tmdbId}
        return fetchJson(API_BASE + "/v1/items/movie/" + id, API_RETRIES)
            .then(function(json) {
                return json && json.item && json.item.code ? json.item.code : null;
            });
    }

    // Serie: /v1/items/tvshow/{tmdbId}/seasons/{season}/episodes/{episode}
    var url = API_BASE + "/v1/items/tvshow/" + id +
        "/seasons/" + encodeURIComponent(seasonNum) +
        "/episodes/" + encodeURIComponent(episodeNum);

    return fetchJson(url, API_RETRIES)
        .then(function(json) {
            return json && json.episode && json.episode.code ? json.episode.code : null;
        });
}

// ==========================================
// 5.1 SOPORTE DE IDS CINEMETA (IMDb) -> TMDB
// ==========================================

var tmdbIdCache = {};

// Acepta: "123", "tmdb:123", "tt1234567", "tt1234567:1:2" (formato Stremio/Cinemeta)
function parseMediaId(rawId) {
    var str = String(rawId).trim();
    if (str.indexOf("tmdb:") === 0) str = str.slice(5);
    var parts = str.split(":");
    var out = { id: parts[0], season: null, episode: null };
    if (parts.length >= 3) {
        var ps = parseInt(parts[1], 10);
        var pe = parseInt(parts[2], 10);
        out.season = isNaN(ps) ? null : ps;
        out.episode = isNaN(pe) ? null : pe;
    }
    return out;
}

function resolveTmdbId(id, isTv) {
    if (!/^tt\d+$/i.test(id)) return Promise.resolve(id); // ya es un ID de TMDB

    var cacheKey = (isTv ? "tv:" : "movie:") + id;
    if (tmdbIdCache[cacheKey]) return Promise.resolve(tmdbIdCache[cacheKey]);

    if (!TMDB_API_KEY) {
        log("Llegó un ID de IMDb pero TMDB_API_KEY está vacía");
        return Promise.resolve(null);
    }

    var url = TMDB_API + "/find/" + encodeURIComponent(id) +
              "?external_source=imdb_id&api_key=" + encodeURIComponent(TMDB_API_KEY);

    return fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, API_TIMEOUT)
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(json) {
            if (!json) return null;
            var list = isTv ? json.tv_results : json.movie_results;
            if (list && list.length && list[0].id) {
                tmdbIdCache[cacheKey] = String(list[0].id);
                return tmdbIdCache[cacheKey];
            }
            return null;
        })
        .catch(function(err) {
            log("resolveTmdbId error", err && err.message);
            return null;
        });
}

// ==========================================
// 6. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return Promise.resolve([]);

    log("getStreams", tmdbId, mediaType, seasonNum, episodeNum);

    var isTv = mediaType === "tv" || mediaType === "series";
    var parsed = parseMediaId(tmdbId);

    // Prioriza los parámetros explícitos; si no vienen, usa lo que trae el ID (tt123:1:2)
    var s = seasonNum != null ? parseInt(seasonNum, 10) : parsed.season;
    var e = episodeNum != null ? parseInt(episodeNum, 10) : parsed.episode;
    if (s == null || isNaN(s)) s = 1;
    if (e == null || isNaN(e)) e = 1;

    return resolveTmdbId(parsed.id, isTv).then(function(realId) {
        if (!realId) return null;
        return fetchFileCode(realId, isTv, s, e);
    }).then(function(fileCode) {
        if (!fileCode) return [];

        return resolveVimeos(fileCode).then(function(stream) {
            if (stream && stream.url) {
                return [{
                    name: "CineCalidad",
                    title: stream.quality + " · " + stream.server + " (Latino)",
                    url: stream.url,
                    quality: stream.quality,
                    headers: stream.headers
                }];
            }
            return [];
        });
    }).catch(function(err) {
        log("getStreams error", err && err.message);
        return [];
    });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
