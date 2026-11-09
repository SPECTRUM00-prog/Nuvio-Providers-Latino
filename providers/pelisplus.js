/**
 * Provider: PelisPlus / TioPlus (Películas y Series)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 * Reglas Hermes: ES5 estricto, Zero-Dependencies, Fast Timeout (<= 2800ms)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://tioplus.app";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;

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

function pureBtoa(str) {
    if (typeof btoa === "function") {
        try { return btoa(str); } catch (e) {}
    }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    for (var block = 0, charCode, i = 0, map = chars;
         str.charAt(i | 0) || (map = "=", i % 1);
         output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xFF) return "";
        block = block << 8 | charCode;
    }
    return output;
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

function scoreCandidate(slug, titles, year) {
    if (!slug) return 0;
    var cleanS = cleanTitle(slug);
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
            var ratio = (matches / words.length) * 75;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && year && cleanS.indexOf(String(year)) !== -1) {
        score += 20;
    }

    return score;
}

function unpackDeanEdwards(p, a, c, k) {
    var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    function decodeBase(val, radix) {
        var res = 0;
        for (var i = 0; i < val.length; i++) {
            var idx = dict.indexOf(val[i]);
            if (idx === -1) return NaN;
            res = res * radix + idx;
        }
        return res;
    }
    return p.replace(/\b([0-9a-zA-Z]+)\b/g, function(token) {
        var index = decodeBase(token, a);
        if (isNaN(index) || index >= k.length) return token;
        return (k[index] && k[index] !== "") ? k[index] : token;
    });
}

function unpackFromHtml(html) {
    if (!html) return "";
    var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
    if (!packMatch) {
        packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\('\|'\)/);
    }
    if (!packMatch) return "";

    return unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
}

// ==========================================
// 2. DETECCIÓN DINÁMICA DE RESOLUCIÓN REAL
// ==========================================

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

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) {
        return Promise.resolve("720p");
    }

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
            if (m3u8Url.indexOf("480") !== -1) return "480p";
            return "720p";
        }

        var maxW = 0, maxH = 0;
        var resRegex = /RESOLUTION=(\d+)x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var w = parseInt(match[1], 10);
            var h = parseInt(match[2], 10);
            if (w > maxW) maxW = w;
            if (h > maxH) maxH = h;
        }

        if (maxW >= 3840 || maxH >= 2160) return "4K";
        if (maxW >= 1920 || maxH >= 1080) return "1080p";
        if (maxW >= 1280 || maxH >= 720) return "720p";
        if (maxW >= 854 || maxH >= 480) return "480p";
        return "720p";
    })
    .catch(function() {
        return "720p";
    });
}

function getServerLabel(url) {
    if (!url) return "Online";
    var u = url.toLowerCase();
    if (u.indexOf("vidhide") !== -1 || u.indexOf("callistanise") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("morencius") !== -1) return "VidHide";
    if (u.indexOf("turbovid") !== -1 || u.indexOf("emturbovid") !== -1 || u.indexOf("turboviplay") !== -1 || u.indexOf("turbovidhls") !== -1) return "Turbovid";
    if (u.indexOf("goodstream") !== -1) return "GoodStream";
    if (u.indexOf("vimeos") !== -1) return "Vimeos";
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("flaswish") !== -1 || u.indexOf("hglink") !== -1) return "StreamWish";
    return "Online";
}

// ==========================================
// 3. RESOLVERS DE STREAMING ROBUSTOS
// ==========================================

function resolveVidHide(url) {
    var targetUrl = url;
    if (targetUrl.indexOf("callistanise.com/") !== -1 && targetUrl.indexOf("/v/") === -1 && targetUrl.indexOf("/e/") === -1) {
        targetUrl = targetUrl.replace("callistanise.com/", "callistanise.com/v/");
    } else if (targetUrl.indexOf("vidhideplus.com/") !== -1 && targetUrl.indexOf("/v/") === -1 && targetUrl.indexOf("/e/") === -1) {
        targetUrl = targetUrl.replace("vidhideplus.com/", "vidhideplus.com/v/");
    }

    var hostMatch = targetUrl.match(/^(https?:\/\/[^/]+)/i);
    var hostOrigin = hostMatch ? hostMatch[1] : "https://callistanise.com";

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, 2800)
    .then(function(res) {
        if (!res) return "";
        var finalHostMatch = (res.url || "").match(/^(https?:\/\/[^/]+)/i);
        if (finalHostMatch) hostOrigin = finalHostMatch[1];
        return res.text();
    })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = null;

        var unpacked = unpackFromHtml(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) || unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) streamUrl = m3u8Match[1] || m3u8Match[0];
        }

        if (!streamUrl) {
            var directMatch = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)["']/i);
            if (directMatch) streamUrl = directMatch[1];
        }

        if (streamUrl) {
            if (streamUrl.indexOf("/") === 0) streamUrl = hostOrigin + streamUrl;
            var streamHeaders = { "User-Agent": USER_AGENT, "Referer": targetUrl };

            return probeM3u8Quality(streamUrl, streamHeaders).then(function(quality) {
                return {
                    url: streamUrl,
                    serverName: "VidHide",
                    quality: quality || "720p",
                    headers: streamHeaders
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveTurbovid(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, 2800)
    .then(function(res) { return res ? res.text() : ""; })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = null;

        var unpacked = unpackFromHtml(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) || unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) streamUrl = m3u8Match[1] || m3u8Match[0];
        }

        if (!streamUrl) {
            var directMatch = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)["']/i);
            if (directMatch) streamUrl = directMatch[1];
        }

        if (streamUrl) {
            var streamHeaders = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(streamUrl, streamHeaders).then(function(quality) {
                return {
                    url: streamUrl,
                    serverName: "Turbovid",
                    quality: quality || "720p",
                    headers: streamHeaders
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url) {
    var targetUrl = url;
    if (targetUrl.indexOf("/f/") !== -1 || targetUrl.indexOf("/v/") !== -1) {
        targetUrl = targetUrl.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl },
        redirect: "follow"
    }, 2800)
    .then(function(res) { return res ? res.text() : ""; })
    .then(function(html) {
        if (!html) return null;

        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) {
            return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                return { url: direct[1], serverName: "StreamWish", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            });
        }

        var unpacked = unpackFromHtml(html);
        if (unpacked) {
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                    return { url: m3u8[0], serverName: "StreamWish", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
                });
            }
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    if (u.indexOf("vidhide") !== -1 || u.indexOf("callistanise") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("morencius") !== -1) {
        return resolveVidHide(url);
    }
    if (u.indexOf("turbovid") !== -1 || u.indexOf("emturbovid") !== -1 || u.indexOf("turbovidhls") !== -1 || u.indexOf("turboviplay") !== -1) {
        return resolveTurbovid(url);
    }
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("flaswish") !== -1 || u.indexOf("hglink") !== -1) {
        return resolveStreamWish(url);
    }

    return Promise.resolve(null);
}

function resolvePlayerEndpoint(playerUrl) {
    return fetchWithTimeout(playerUrl, { headers: DEFAULT_HEADERS, redirect: "follow" }, 2800)
        .then(function(res) {
            if (!res) return null;
            var targetUrl = res.url || "";

            if (targetUrl && targetUrl.indexOf("tioplus.app/player/") === -1) {
                return dispatchResolver(targetUrl);
            }

            return res.text().then(function(html) {
                if (!html) return null;

                var ifrMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (ifrMatch) {
                    var innerUrl = ifrMatch[1];
                    if (innerUrl.indexOf("/") === 0) innerUrl = BASE_URL + innerUrl;
                    return dispatchResolver(innerUrl);
                }

                var locMatch = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                               html.match(/location\.replace\(["']([^"']+)["']\)/i);
                if (locMatch) {
                    return dispatchResolver(locMatch[1]);
                }

                return null;
            });
        })
        .catch(function() {
            return null;
        });
}

// ==========================================
// 4. BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchPelisplusSingle(query, isMovie) {
    var searchUrl = BASE_URL + "/api/search/" + encodeURIComponent(query);

    return fetchWithTimeout(searchUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": BASE_URL + "/search"
        }
    }, 2800)
    .then(function(res) {
        if (!res || !res.ok) return [];
        return res.text();
    })
    .then(function(html) {
        if (!html) return [];
        var pattern = isMovie ? /href=["']((?:https?:\/\/[^"']*)?\/pelicula\/[^"']+)["']/gi
                              : /href=["']((?:https?:\/\/[^"']*)?\/serie\/[^"']+)["']/gi;
        var matches = [];
        var match;

        while ((match = pattern.exec(html)) !== null) {
            var fullPath = match[1];
            var slug = fullPath.split(isMovie ? "/pelicula/" : "/serie/").pop().replace(/\/$/, "");
            if (slug && matches.indexOf(slug) === -1) {
                matches.push(slug);
            }
        }
        return matches;
    })
    .catch(function() { return []; });
}

function searchMultiQuery(queries, isMovie) {
    function tryNext(idx) {
        if (idx >= queries.length) return Promise.resolve([]);
        return searchPelisplusSingle(queries[idx], isMovie).then(function(slugs) {
            if (slugs && slugs.length > 0) return slugs;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

function extractStreamsFromUrl(pageUrl) {
    return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, 2800)
        .then(function(res) {
            if (!res || !res.ok) return [];
            return res.text();
        })
        .then(function(html) {
            if (!html) return [];
            var tokens = [];

            var dataServerRegex = /data-server=["']([^"']+)["']/gi;
            var dsMatch;
            while ((dsMatch = dataServerRegex.exec(html)) !== null) {
                tokens.push(dsMatch[1]);
            }

            var dataTrRegex = /data-tr=["']([^"']+)["']/gi;
            var dtMatch;
            while ((dtMatch = dataTrRegex.exec(html)) !== null) {
                tokens.push(dtMatch[1]);
            }

            var uniqueTokens = [];
            for (var t = 0; t < tokens.length; t++) {
                if (tokens[t] && uniqueTokens.indexOf(tokens[t]) === -1) {
                    uniqueTokens.push(tokens[t]);
                }
            }

            if (uniqueTokens.length === 0) return [];

            var promises = uniqueTokens.map(function(tok) {
                var playerUrl = BASE_URL + "/player/" + pureBtoa(tok);
                return resolvePlayerEndpoint(playerUrl)
                    .then(function(res) {
                        if (!res || !res.url) return null;
                        var sName = res.serverName || getServerLabel(res.url);
                        var q = res.quality || "720p";
                        return {
                            name: "PelisPlus",
                            title: q + " · Latino · " + sName,
                            quality: q,
                            url: res.url,
                            headers: res.headers || {}
                        };
                    })
                    .catch(function() { return null; });
            });

            return Promise.all(promises).then(function(results) {
                var valid = [];
                for (var v = 0; v < results.length; v++) {
                    if (results[v]) valid.push(results[v]);
                }
                return valid;
            });
        })
        .catch(function() {
            return [];
        });
}

// ==========================================
// 5. FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    if (!tmdbId) return Promise.resolve([]);

    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = parseInt(episode, 10) || 1;
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, null, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB HTTP Error");
            return res.json();
        })
        .then(function(meta) {
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = ((isMovie ? meta.release_date : meta.first_air_date) || "").substring(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var searchQueries = [];
            for (var j = 0; j < titles.length; j++) {
                var rawT = titles[j];
                if (!rawT) continue;

                if (searchQueries.indexOf(rawT) === -1) searchQueries.push(rawT);

                if (rawT.indexOf("&") !== -1) {
                    var withY = rawT.replace(/&/g, "y").replace(/\s+/g, " ").trim();
                    if (searchQueries.indexOf(withY) === -1) searchQueries.push(withY);

                    var withAnd = rawT.replace(/&/g, "and").replace(/\s+/g, " ").trim();
                    if (searchQueries.indexOf(withAnd) === -1) searchQueries.push(withAnd);
                }

                var shortT = rawT.split(/[:\-\(]/)[0].trim();
                if (shortT && searchQueries.indexOf(shortT) === -1) searchQueries.push(shortT);
            }

            return searchMultiQuery(searchQueries, isMovie).then(function(slugs) {
                if (!slugs || slugs.length === 0) return [];

                var scored = [];
                for (var s = 0; s < slugs.length; s++) {
                    var sc = scoreCandidate(slugs[s], titles, year);
                    if (sc >= 35) {
                        scored.push({ slug: slugs[s], score: sc });
                    }
                }

                if (scored.length === 0) return [];

                scored.sort(function(a, b) { return b.score - a.score; });

                function tryNextSlug(index) {
                    if (index >= scored.length) return Promise.resolve([]);
                    var slug = scored[index].slug;

                    var pageUrlsToTry = [];
                    if (isMovie) {
                        pageUrlsToTry.push(BASE_URL + "/pelicula/" + slug);
                    } else {
                        pageUrlsToTry.push(BASE_URL + "/serie/" + slug + "/season/" + sNum + "/episode/" + eNum);
                        pageUrlsToTry.push(BASE_URL + "/episodio/" + slug + "-" + sNum + "x" + eNum);
                        pageUrlsToTry.push(BASE_URL + "/ver/" + slug + "-temporada-" + sNum + "-capitulo-" + eNum);
                    }

                    function tryPageUrls(pIdx) {
                        if (pIdx >= pageUrlsToTry.length) return tryNextSlug(index + 1);
                        var targetUrl = pageUrlsToTry[pIdx];

                        return extractStreamsFromUrl(targetUrl).then(function(streams) {
                            if (streams && streams.length > 0) return streams;
                            return tryPageUrls(pIdx + 1);
                        });
                    }

                    return tryPageUrls(0);
                }

                return tryNextSlug(0);
            });
        })
        .catch(function() {
            return [];
        });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
