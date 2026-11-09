/**
 * Provider: Cinecalidad Oficial (www.cinecalidad.am)
 * Motor Híbrido:
 *   1. Streaming Online Directo: Vimeos (HLS 1080p / 720p dinámico)
 *   2. Streaming P2P / Torrents: Nuvio Engine / Stremio (Magnets Dual Latino 1080p / 720p)
 * Reglas Hermes: ES5 estricto, 100% Promesas, Zero-Dependencies, Fast Timeout (<= 2800ms)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://www.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS DE RED Y NORMALIZACIÓN
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    var timer = null;

    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error("Timeout"));
        }, limit);
    });

    return Promise.race([fetch(url, options), timeoutPromise])
        .then(function(res) {
            if (timer) clearTimeout(timer);
            return res;
        })
        .catch(function() {
            if (timer) clearTimeout(timer);
            return null;
        });
}

function cleanTitle(str) {
    if (!str) return "";
    var normalized = str;
    try {
        normalized = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}

    return normalized
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreCandidate(candidateUrl, candidateText, targetTitles, targetYear) {
    var cleanUrlText = cleanTitle(candidateUrl.replace(BASE_URL, "").replace(/\//g, " "));
    var cleanInnerText = cleanTitle(candidateText || "");
    var score = 0;

    for (var i = 0; i < targetTitles.length; i++) {
        var t = cleanTitle(targetTitles[i]);
        if (!t) continue;

        if (cleanUrlText.indexOf(t) !== -1 || cleanInnerText.indexOf(t) === 0) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (cleanUrlText.indexOf(words[j]) !== -1 || cleanInnerText.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0 && matches > 0) {
            var ratio = (matches / words.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && targetYear) {
        if (cleanUrlText.indexOf(String(targetYear)) !== -1 || cleanInnerText.indexOf(String(targetYear)) !== -1) {
            score += 20;
        }
    }

    return score;
}

// ==========================================
// 2. DESEMPAQUETADOR Y DETECCIÓN DE CALIDAD
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

function detectQualityFromUrl(url) {
    if (!url) return null;
    var clean = url.split("?")[0].toLowerCase();

    if (clean.indexOf(".urlset") !== -1) {
        var urlsetMatch = clean.match(/[_,]([a-z,]+)\.urlset/i);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("fhd") !== -1) return "1080p";
            if (tags.indexOf("h") !== -1 || tags.indexOf("hd") !== -1) return "720p";
            if (tags.indexOf("n") !== -1 || tags.indexOf("sd") !== -1) return "480p";
            if (tags.indexOf("l") !== -1) return "360p";
        }
    }

    if (/(?:[-_./]|^)(?:4k|2160p?)(?:[-_./]|$)/i.test(clean)) return "4K";
    if (/(?:[-_./]|^)(?:1080p?|fhd)(?:[-_./]|$)/i.test(clean)) return "1080p";
    if (/(?:[-_./]|^)(?:720p?)(?:[-_./]|$)/i.test(clean)) return "720p";
    if (/(?:[-_./]|^)(?:480p?)(?:[-_./]|$)/i.test(clean)) return "480p";

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
        if (!res || !res.ok) return "720p";
        return res.text();
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            if (m3u8Url.indexOf("1080") !== -1) return "1080p";
            if (m3u8Url.indexOf("720") !== -1) return "720p";
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
// 3. RESOLVER DE VIMEOS (STREAMING ONLINE)
// ==========================================

function resolveVimeos(embedUrl) {
    if (!embedUrl) return Promise.resolve(null);
    var targetUrl = embedUrl;
    if (targetUrl.indexOf("http") !== 0) {
        targetUrl = "https://vimeos.net/embed-" + embedUrl + ".html";
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
    }, 2800)
    .then(function(res) { return res ? res.text() : ""; })
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
            var hdrs = { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" };
            return probeM3u8Quality(streamUrl, hdrs).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "1080p",
                    server: "Vimeos",
                    headers: hdrs
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 4. RESOLVER DE TORRENTS (P2P / MAGNETS)
// ==========================================

function resolveTorrentMagnet(tItem, refererUrl) {
    return fetchWithTimeout(tItem.url, {
        headers: { "User-Agent": USER_AGENT, "Referer": refererUrl }
    }, 2500)
    .then(function(res) { return res ? res.text() : ""; })
    .then(function(html) {
        var magnetMatch = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>]*/i);
        if (magnetMatch) {
            return {
                name: "CineCalidad",
                title: tItem.quality + " · " + tItem.label + " · P2P",
                quality: tItem.quality,
                url: magnetMatch[0],
                headers: {}
            };
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 5. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return Promise.resolve([]);

    var isTv = mediaType === "tv" || mediaType === "series";
    var s = parseInt(seasonNum || 1, 10);
    var e = parseInt(episodeNum || 1, 10);
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isTv ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, {}, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB Error");
            return res.json();
        })
        .then(function(meta) {
            var title = isTv ? (meta.name || meta.original_name) : (meta.title || meta.original_title);
            var origTitle = isTv ? meta.original_name : meta.original_title;
            var year = ((isTv ? meta.first_air_date : meta.release_date) || "").substring(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var searchQuery = cleanTitle(title || origTitle);
            var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(searchQuery);

            return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2800)
                .then(function(res) {
                    if (!res || !res.ok) return "";
                    return res.text();
                })
                .then(function(html) {
                    if (!html) return [];

                    var candidates = [];
                    var regex = /<a[^>]+href=["']([^"']*(?:ver-pelicula|ver-serie)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
                    var m;

                    while ((m = regex.exec(html)) !== null) {
                        var href = m[1];
                        var innerText = m[2].replace(/<[^>]+>/g, "").trim();

                        if (candidates.map(function(c) { return c.url; }).indexOf(href) === -1) {
                            var sc = scoreCandidate(href, innerText, titles, year);
                            if (sc >= 35) {
                                candidates.push({ url: href, score: sc });
                            }
                        }
                    }

                    if (candidates.length === 0) return [];

                    candidates.sort(function(a, b) { return b.score - a.score; });
                    var targetUrl = candidates[0].url;

                    if (targetUrl.indexOf("http") !== 0) {
                        targetUrl = BASE_URL + (targetUrl.indexOf("/") === 0 ? "" : "/") + targetUrl;
                    }

                    if (isTv) {
                        var epPath = targetUrl.replace(/\/$/, "") + "-" + s + "x" + e + "/";
                        targetUrl = epPath;
                    }

                    return fetchWithTimeout(targetUrl, { headers: DEFAULT_HEADERS }, 2800)
                        .then(function(r) { return r ? r.text() : ""; })
                        .then(function(pageHtml) {
                            if (!pageHtml) return [];

                            // 1. Extraer streaming online (Vimeos)
                            var onlinePromises = [];
                            var lRegex = /https?:\/\/[a-zA-Z0-9.-]*vimeos\.[a-z]{2,6}\/[^\s"'<>]+/gi;
                            var lm;
                            var vimeosUrls = [];

                            while ((lm = lRegex.exec(pageHtml)) !== null) {
                                var clk = lm[0].replace(/\\/g, "").replace(/&amp;/g, "&");
                                if (vimeosUrls.indexOf(clk) === -1) {
                                    vimeosUrls.push(clk);
                                    onlinePromises.push(
                                        resolveVimeos(clk).then(function(stream) {
                                            if (stream && stream.url) {
                                                return {
                                                    name: "CineCalidad",
                                                    title: stream.quality + " · Latino · " + stream.server,
                                                    quality: stream.quality,
                                                    url: stream.url,
                                                    headers: stream.headers || {
                                                        "User-Agent": USER_AGENT,
                                                        "Referer": BASE_URL + "/"
                                                    }
                                                };
                                            }
                                            return null;
                                        })
                                    );
                                }
                            }

                            // 2. Extraer Torrents Duales (uTorrent) para películas
                            var torrentPromises = [];
                            if (!isTv) {
                                var tRegex = /<a[^>]+href=["']([^"']*\?download=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                                var tm;
                                var candidateTorrents = [];

                                while ((tm = tRegex.exec(pageHtml)) !== null) {
                                    var tHref = tm[1];
                                    var tText = tm[2].replace(/<[^>]+>/g, "").trim();

                                    if (tText.toLowerCase().indexOf("utorrent") !== -1 || tText.toLowerCase().indexOf("torrent") !== -1) {
                                        var tQuality = "1080p";
                                        if (tText.indexOf("4K") !== -1 || tText.indexOf("2160") !== -1) tQuality = "4K";
                                        else if (tText.indexOf("1080") !== -1) tQuality = "1080p";
                                        else if (tText.indexOf("720") !== -1) tQuality = "720p";
                                        else if (tText.indexOf("DVD") !== -1 || tText.indexOf("480") !== -1) tQuality = "480p";

                                        var label = tText.replace(/uTorrent/i, "").trim() || "Dual";
                                        candidateTorrents.push({ url: tHref, label: label, quality: tQuality });
                                    }
                                }

                                // Tomar los mejores 2 torrents para mantener tiempo < 2.8s
                                var topTorrents = candidateTorrents.slice(0, 2);
                                for (var ti = 0; ti < topTorrents.length; ti++) {
                                    torrentPromises.push(resolveTorrentMagnet(topTorrents[ti], targetUrl));
                                }
                            }

                            // Resolver streams online y torrents en paralelo
                            return Promise.all(onlinePromises.concat(torrentPromises)).then(function(allResults) {
                                var valid = [];
                                for (var v = 0; v < allResults.length; v++) {
                                    if (allResults[v] && allResults[v].url) {
                                        valid.push(allResults[v]);
                                    }
                                }
                                return valid;
                            });
                        });
                });
        })
        .catch(function() {
            return [];
        });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
