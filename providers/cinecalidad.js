/**
 * Plugin de CineCalidad (Películas y Series) para Nuvio Media Hub
 * Arquitectura: API REST JSON Oficial (tmdb.cinecalidad.am)
 * Compatible con Android TV y FireTV (Hermes Engine - 100% Promise Chains)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var API_BASE = "https://tmdb.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 3200;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Referer": "https://www.cinecalidad.am/"
};

// ==========================================
// 1. HELPERS DE RED Y TIMEOUT (HERMES SAFE)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return Promise.race([
        fetch(url, options),
        new Promise(function(_, reject) {
            setTimeout(function() {
                reject(new Error("Timeout"));
            }, limit);
        })
    ]);
}

function cleanTitle(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ==========================================
// 2. DESEMPAQUETADOR DEAN EDWARDS
// ==========================================

function unpackJS(packed) {
    try {
        var regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        var match = packed.match(regex);
        if (!match) return null;

        var p = match[1].slice(1, -1);
        var a = match[2];
        var k = match[4];
        var words = k.split("|");
        var radix = parseInt(a, 10);

        var unbase = function(val, base) {
            var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
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

    if (/4k|2160p?/i.test(u)) return "4K";
    if (/1080p?/i.test(u)) return "1080p";
    if (/720p?/i.test(u)) return "720p";
    if (/480p?/i.test(u)) return "480p";
    return null;
}

function probeM3u8Quality(m3u8Url, headers) {
    var fastQ = detectQualityFromUrl(m3u8Url);
    if (fastQ) return Promise.resolve(fastQ);

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2500)
    .then(function(res) {
        if (!res.ok) return "720p";
        return res.text();
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            if (/1080/i.test(m3u8Url)) return "1080p";
            if (/720/i.test(m3u8Url)) return "720p";
            return "720p";
        }

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
    .catch(function() {
        return "720p";
    });
}

// ==========================================
// 4. RESOLVER DE VIMEOS (HLS DIRECTO)
// ==========================================

function resolveVimeos(fileCode) {
    if (!fileCode) return Promise.resolve(null);
    var embedUrl = "https://vimeos.net/embed-" + fileCode + ".html";

    return fetchWithTimeout(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
    }, NETWORK_TIMEOUT)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var unpacked = unpackJS(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) ||
                            unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) streamUrl = m3u8Match[1].replace(/\\/g, "");
        }
        if (!streamUrl) {
            var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) streamUrl = direct[1].replace(/\\/g, "");
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "1080p",
                    server: "Vimeos",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 5. EXTRACTOR VÍA API DE CINECALIDAD LITE
// ==========================================

function fetchFileCode(tmdbId, isTv, seasonNum, episodeNum) {
    var endpoint = "";
    if (!isTv) {
        // Película: /v1/items/movie/{tmdbId}
        endpoint = API_BASE + "/v1/items/movie/" + tmdbId;
        return fetchWithTimeout(endpoint, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
            .then(function(res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function(json) {
                if (json && json.item && json.item.code) {
                    return json.item.code;
                }
                return null;
            })
            .catch(function() { return null; });
    } else {
        // Serie: /v1/items/tvshow/{tmdbId}/seasons/{season}/episodes/{episode}
        endpoint = API_BASE + "/v1/items/tvshow/" + tmdbId + "/seasons/" + seasonNum + "/episodes/" + episodeNum;
        return fetchWithTimeout(endpoint, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
            .then(function(res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function(json) {
                if (json && json.episode && json.episode.code) {
                    return json.episode.code;
                }
                return null;
            })
            .catch(function() { return null; });
    }
}

// ==========================================
// 6. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return Promise.resolve([]);

    var isTv = mediaType === "tv" || mediaType === "series";
    var s = parseInt(seasonNum || 1, 10);
    var e = parseInt(episodeNum || 1, 10);

    return fetchFileCode(tmdbId, isTv, s, e).then(function(fileCode) {
        if (!fileCode) return [];

        return resolveVimeos(fileCode).then(function(stream) {
            if (stream && stream.url) {
                return [{
                    name: "CineCalidad",
                    title: stream.quality + " · " + stream.server + " (Latino)",
                    url: stream.url,
                    quality: stream.quality,
                    headers: stream.headers || {
                        "User-Agent": USER_AGENT,
                        "Referer": "https://vimeos.net/"
                    }
                }];
            }
            return [];
        });
    }).catch(function() {
        return [];
    });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
