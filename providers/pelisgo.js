/**
 * Provider: PelisGO (Películas y Series)
 * Dominio: https://pelisgo.online
 * Arquitectura: Next.js App Router + API REST Interna (/api/movies y /api/series)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Android TV / Desktop)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 3200;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS DE RED & STRINGS (HERMES SAFE)
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

function cleanSlug(slug) {
    if (!slug) return "";
    return slug.replace(/\/$/, "").split("/").pop().toLowerCase().replace(/-/g, " ");
}

function scoreCandidate(candidateSlug, titles, year) {
    if (!candidateSlug) return 0;
    var cleanS = cleanSlug(candidateSlug);
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        if (cleanS === t || cleanS.indexOf(t) === 0) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (cleanS.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0 && matches > 0) {
            var ratio = (matches / words.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && year && cleanS.indexOf(String(year)) !== -1) {
        score += 15;
    }

    return score;
}

// ==========================================
// 2. DESEMPAQUETADOR DEAN EDWARDS
// ==========================================

function unpackJS(packed) {
    try {
        var regex = /eval\(function\(p,a,c,k,e,[r|d|a-z]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        var match = packed.match(regex);
        if (!match) return null;

        var p = match[1].slice(1, -1);
        var a = match[2];
        var k = match[4];
        var words = k.split("|");
        var radix = parseInt(a, 10);

        var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var unbase = function(val, base) {
            if (base <= 36) return parseInt(val, base);
            var res = 0;
            for (var i = 0; i < val.length; i++) {
                res = res * base + dict.indexOf(val[i]);
            }
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
// 3. DETECCIÓN DINÁMICA DE RESOLUCIÓN REAL
// ==========================================

function probeM3u8Quality(m3u8Url, headers) {
    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2000)
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
// 4. RESOLVERS DE STREAMING INDIVIDUALES
// ==========================================

function resolveFilemoon(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": url },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) streamUrl = direct[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) streamUrl = m3u8[0].replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return { url: streamUrl, quality: q || "1080p", server: "Filemoon", headers: headers };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveGoodStream(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) streamUrl = direct[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) streamUrl = m3u8[0].replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return { url: streamUrl, quality: q || "720p", server: "GoodStream", headers: headers };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchLinkResolver(item) {
    if (!item || !item.url) return Promise.resolve(null);
    var u = item.url.toLowerCase();
    var sName = (item.server || item.name || "").toLowerCase();

    // 1. Servidor KeKi: Es un stream directo HLS .m3u8 sin intermediarios
    if (u.indexOf(".m3u8") !== -1) {
        var headers = { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" };
        return probeM3u8Quality(item.url, headers).then(function(q) {
            return {
                url: item.url,
                quality: q || item.quality || "1080p",
                server: "KeKi",
                headers: headers
            };
        });
    }

    // 2. Filemoon (Magi)
    if (sName.indexOf("magi") !== -1 || u.indexOf("filemoon") !== -1) {
        return resolveFilemoon(item.url);
    }

    // 3. GoodStream (Flix)
    if (sName.indexOf("flix") !== -1 || u.indexOf("goodstream") !== -1) {
        return resolveGoodStream(item.url);
    }

    return Promise.resolve(null);
}

// ==========================================
// 5. TMDB METADATA
// ==========================================

function getMediaData(tmdbId, mediaType) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(url, null, 2500)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var titles = [];
            if (data.title) titles.push(data.title);
            if (data.name) titles.push(data.name);
            if (data.original_title) titles.push(data.original_title);
            if (data.original_name) titles.push(data.original_name);

            var altArr = (data.alternative_titles && (data.alternative_titles.results || data.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title) titles.push(altArr[i].title);
            }

            var uniqueTitles = [];
            for (var t = 0; t < titles.length; t++) {
                if (titles[t] && uniqueTitles.indexOf(titles[t]) === -1) {
                    uniqueTitles.push(titles[t]);
                }
            }

            return {
                title: isTv ? data.name : data.title,
                titles: uniqueTitles,
                year: (data.release_date || data.first_air_date || "").substring(0, 4)
            };
        })
        .catch(function() { return null; });
}

// ==========================================
// 6. BÚSQUEDA Y EXTRACCIÓN DE ENLACES
// ==========================================

function searchPelisGO(query, isTv) {
    if (!query) return Promise.resolve([]);
    var searchUrl = BASE_URL + "/search?q=" + encodeURIComponent(query);

    return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
        .then(function(res) { return res && res.ok ? res.text() : ""; })
        .then(function(html) {
            var linkPattern = isTv ? /href=["'](\/series\/[^"'\s<>]+)["']/gi : /href=["'](\/movies\/[^"'\s<>]+)["']/gi;
            var slugs = [];
            var m;
            while ((m = linkPattern.exec(html)) !== null) {
                var path = m[1].replace("/movies/", "").replace("/series/", "").replace(/\/$/, "");
                if (path && slugs.indexOf(path) === -1) {
                    slugs.push(path);
                }
            }
            return slugs;
        })
        .catch(function() { return []; });
}

function searchMultiQuery(queries, isTv) {
    function tryNext(idx) {
        if (idx >= queries.length) return Promise.resolve([]);
        return searchPelisGO(queries[idx], isTv).then(function(results) {
            if (results && results.length > 0) return results;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

// ==========================================
// 7. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return Promise.resolve([]);

    var isTv = mediaType === "tv" || mediaType === "series";
    var s = parseInt(seasonNum || 1, 10);
    var e = parseInt(episodeNum || 1, 10);

    return getMediaData(tmdbId, mediaType).then(function(media) {
        if (!media || !media.titles || media.titles.length === 0) return [];

        var searchQueries = [];
        for (var i = 0; i < media.titles.length; i++) {
            var raw = media.titles[i];
            var clean = cleanTitle(raw);
            if (clean && searchQueries.indexOf(clean) === -1) searchQueries.push(clean);

            var words = clean.split(/\s+/).filter(function(w) { return w.length > 2; });
            if (words.length >= 2) {
                var shortQ = words.slice(0, 2).join(" ");
                if (searchQueries.indexOf(shortQ) === -1) searchQueries.push(shortQ);
            }
        }

        return searchMultiQuery(searchQueries, isTv).then(function(slugs) {
            if (!slugs || slugs.length === 0) return [];

            // Filtrado de calidad estricto score >= 35
            var scoredCandidates = [];
            for (var u = 0; u < slugs.length; u++) {
                var sc = scoreCandidate(slugs[u], media.titles, media.year);
                if (sc >= 35) {
                    scoredCandidates.push({ slug: slugs[u], score: sc });
                }
            }

            if (scoredCandidates.length === 0) return [];

            scoredCandidates.sort(function(a, b) { return b.score - a.score; });

            function tryCandidates(cIdx) {
                if (cIdx >= scoredCandidates.length) return Promise.resolve([]);
                var currentSlug = scoredCandidates[cIdx].slug;

                var pageUrl = isTv ? 
                    (BASE_URL + "/series/" + currentSlug + "/temporada/" + s + "/episodio/" + e) :
                    (BASE_URL + "/movies/" + currentSlug);

                return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
                    .then(function(res) {
                        if (!res.ok) return null;
                        return res.text();
                    })
                    .then(function(html) {
                        if (!html) return null;

                        // Extraer ID según sea película (movieId) o serie (episodeId)
                        var idMatch = isTv ?
                            (html.match(/\\?"episodeId\\?"\s*:\s*\\?"([^"\\s]+)\\?"/i) || html.match(/episodeId\s*:\s*["']([^"']+)["']/i)) :
                            (html.match(/\\?"movieId\\?"\s*:\s*\\?"([^"\\s]+)\\?"/i) || html.match(/movieId\s*:\s*["']([^"']+)["']/i));

                        var entityId = idMatch ? idMatch[1] : null;
                        if (!entityId) return null;

                        var streamApi = isTv ?
                            (BASE_URL + "/api/series/episode/" + entityId + "/stream") :
                            (BASE_URL + "/api/movies/" + entityId + "/stream");

                        return fetchWithTimeout(streamApi, {
                            headers: { "User-Agent": USER_AGENT, "Accept": "application/json", "Referer": pageUrl }
                        }, NETWORK_TIMEOUT)
                        .then(function(r) { return r.json(); })
                        .then(function(streamJson) {
                            return (streamJson && streamJson.links && streamJson.links.length > 0) ? streamJson.links : null;
                        });
                    })
                    .then(function(links) {
                        if (!links || links.length === 0) {
                            return tryCandidates(cIdx + 1);
                        }

                        var resolvePromises = links.map(function(item) {
                            return dispatchLinkResolver(item).then(function(res) {
                                if (res && res.url) {
                                    return {
                                        name: "PelisGO",
                                        title: (res.quality || item.quality || "1080p") + " · " + (item.language || "Latino") + " · " + res.server,
                                        url: res.url,
                                        quality: res.quality || item.quality || "1080p",
                                        headers: res.headers || { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
                                    };
                                }
                                return null;
                            });
                        });

                        return Promise.all(resolvePromises).then(function(results) {
                            var streams = [];
                            for (var r = 0; r < results.length; r++) {
                                if (results[r]) streams.push(results[r]);
                            }
                            if (streams.length > 0) return streams;
                            return tryCandidates(cIdx + 1);
                        });
                    });
            }

            return tryCandidates(0);
        });
    }).catch(function() {
        return [];
    });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
