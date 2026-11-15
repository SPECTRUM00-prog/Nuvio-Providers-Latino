/**
 * Provider: LaMovie (Películas en Español Latino y Dual)
 * Motor: FastApi v1 (lamovie.org) + Multi-Resolver (Vimeos, StreamWish/PlayerWish, Filemoon)
 * Reglas Hermes: ES5 estricto, 100% Promesas, Zero-Dependencies, AbortController + clearTimeout.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://lamovie.org";
var API_BASE = BASE_URL + "/wp-api/v1";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2600;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": BASE_URL + "/"
};

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var fetchOpts = {};

    if (options) {
        for (var key in options) {
            if (Object.prototype.hasOwnProperty.call(options, key)) {
                fetchOpts[key] = options[key];
            }
        }
    }
    if (controller) {
        fetchOpts.signal = controller.signal;
    }

    return new Promise(function(resolve) {
        var timer = setTimeout(function() {
            if (controller) {
                try { controller.abort(); } catch (e) {}
            }
            resolve(null);
        }, limit);

        fetch(url, fetchOpts)
            .then(function(res) {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(function() {
                clearTimeout(timer);
                resolve(null);
            });
    });
}

function cleanTitle(str) {
    if (!str) return "";
    var norm = str.toLowerCase();
    try {
        norm = norm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return norm
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreCandidate(itemTitle, targetTitles, targetYear) {
    if (!itemTitle) return 0;
    var cTitle = cleanTitle(itemTitle);
    if (!cTitle) return 0;

    var candWords = cTitle.split(/\s+/);
    var score = 0;

    for (var i = 0; i < targetTitles.length; i++) {
        var t = cleanTitle(targetTitles[i]);
        if (!t) continue;

        if (cTitle === t || (targetYear && cTitle === t + " " + String(targetYear))) {
            score = Math.max(score, 100);
            continue;
        }

        if (cTitle.indexOf(t + " ") === 0) {
            score = Math.max(score, 85);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var targetWords = words.length > 0 ? words : t.split(/\s+/);
        var matches = 0;

        for (var j = 0; j < targetWords.length; j++) {
            if (candWords.indexOf(targetWords[j]) !== -1) {
                matches++;
            }
        }

        if (targetWords.length > 0 && matches > 0) {
            var ratio = (matches / targetWords.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && targetYear && candWords.indexOf(String(targetYear)) !== -1) {
        score += 20;
    }

    return score;
}

function unpackFromHtml(html) {
    if (!html) return "";
    var packRegex = /eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]+\)\{[\s\S]*?\}\((['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\(['"]\|['"]\)/g;
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

    var results = [];
    var packMatch;

    while ((packMatch = packRegex.exec(html)) !== null) {
        var p = packMatch[2];
        var a = parseInt(packMatch[3], 10);
        var k = packMatch[6].split("|");

        var unpacked = p.replace(/\b([0-9a-zA-Z]+)\b/g, function(token) {
            var index = decodeBase(token, a);
            if (isNaN(index) || index >= k.length) return token;
            return (k[index] && k[index] !== "") ? k[index] : token;
        });

        results.push(unpacked.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, "/"));
    }

    return results.join("\n");
}

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();

    if (u.indexOf(".urlset") !== -1) {
        var urlsetMatch = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1) return "1080p";
            if (tags.indexOf("h") !== -1) return "720p";
            if (tags.indexOf("n") !== -1) return "480p";
            if (tags.indexOf("l") !== -1) return "360p";
        }
    }

    var pathOnly = u.split("?")[0].split("#")[0];
    if (/(?:^|[^a-z0-9])(4k|2160p?)(?:[^a-z0-9]|$)/i.test(pathOnly)) return "4K";
    if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "1080p";
    if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "720p";
    if (/(?:^|[^a-z0-9])480p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "480p";
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
            var pathOnly = m3u8Url.split("?")[0];
            if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "1080p";
            if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "720p";
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

function resolveVimeos(embedUrl) {
    if (!embedUrl) return Promise.resolve(null);
    var targetUrl = embedUrl;
    if (targetUrl.indexOf("http") !== 0) {
        targetUrl = "https://vimeos.net/embed-" + embedUrl + ".html";
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
    }, 2600)
    .then(function(res) { return res && res.ok ? res.text() : ""; })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = null;
        var unpacked = unpackFromHtml(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                            unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8Match) streamUrl = m3u8Match[1] || m3u8Match[0];
        }
        if (!streamUrl) {
            var cleanHtml = html.replace(/\\\//g, "/");
            var direct = cleanHtml.match(/(?:file|sources|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (direct) streamUrl = direct[1];
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

function resolveStreamWish(url) {
    var targetUrl = url;
    if (
        targetUrl.indexOf("hglink") !== -1 ||
        targetUrl.indexOf("hanerix") !== -1 ||
        targetUrl.indexOf("hlswish") !== -1 ||
        targetUrl.indexOf("hgcloud") !== -1 ||
        targetUrl.indexOf("streamwish") !== -1 ||
        targetUrl.indexOf("strwish") !== -1 ||
        targetUrl.indexOf("flaswish") !== -1
    ) {
        var idMatch = targetUrl.match(/\/(?:e|v|f)\/([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://playerwish.com/e/" + idMatch[1];
    } else if (targetUrl.indexOf("/f/") !== -1 || targetUrl.indexOf("/v/") !== -1) {
        targetUrl = targetUrl.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    return fetchWithTimeout(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" }, 2600)
        .then(function(res) { return res && res.ok ? res.text() : ""; })
        .then(function(html) {
            if (!html) return null;
            var cleanHtml = html.replace(/\\\//g, "/");
            var direct = cleanHtml.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) {
                return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                    return { url: direct[1], quality: q, server: "StreamWish", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
                });
            }
            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) {
                    return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                        return { url: m3u8[0], quality: q, server: "StreamWish", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
                    });
                }
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveFilemoon(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": url }, redirect: "follow" }, 2600)
        .then(function(res) { return res && res.ok ? res.text() : ""; })
        .then(function(html) {
            if (!html) return null;
            var cleanHtml = html.replace(/\\\//g, "/");
            var direct = cleanHtml.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) {
                return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                    return { url: direct[1], quality: q, server: "Filemoon", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) {
                    return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                        return { url: m3u8[0], quality: q, server: "Filemoon", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                    });
                }
            }
            return null;
        })
        .catch(function() { return null; });
}

function dispatchResolver(rawUrl) {
    if (!rawUrl) return Promise.resolve(null);
    var u = rawUrl.toLowerCase();
    if (u.indexOf("vimeos.net") !== -1) return resolveVimeos(rawUrl);
    if (u.indexOf("hlswish") !== -1 || u.indexOf("streamwish") !== -1 || u.indexOf("playerwish") !== -1 || u.indexOf("vibuxer") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("flaswish") !== -1) return resolveStreamWish(rawUrl);
    if (u.indexOf("filemoon") !== -1) return resolveFilemoon(rawUrl);
    return Promise.resolve(null);
}

function searchLaMoviePosts(queries) {
    function tryNext(idx) {
        if (idx >= queries.length) return Promise.resolve([]);
        var searchUrl = API_BASE + "/search?q=" + encodeURIComponent(queries[idx]);
        return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2600)
            .then(function(res) { return res && res.ok ? res.json() : null; })
            .then(function(searchRes) {
                var posts = (searchRes && searchRes.data && searchRes.data.posts) || [];
                if (posts.length > 0) return posts;
                return tryNext(idx + 1);
            })
            .catch(function() { return tryNext(idx + 1); });
    }
    return tryNext(0);
}

function getStreams(tmdbId, mediaType) {
    if (!tmdbId) return Promise.resolve([]);

    var isMovie = mediaType === "movie";
    if (!isMovie) return Promise.resolve([]);

    var tmdbUrl = "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, {}, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB Error");
            return res.json();
        })
        .then(function(meta) {
            var title = meta.title || meta.original_title || "";
            var origTitle = meta.original_title || "";
            var year = (meta.release_date || "").substring(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var queries = [];
            for (var q = 0; q < titles.length; q++) {
                var cq = cleanTitle(titles[q]);
                if (cq && queries.indexOf(cq) === -1) queries.push(cq);
            }

            return searchLaMoviePosts(queries.slice(0, 3)).then(function(posts) {
                if (!posts || posts.length === 0) return [];

                var scored = [];
                for (var p = 0; p < posts.length; p++) {
                    var post = posts[p];
                    var sc = scoreCandidate(post.title, titles, year);
                    if (sc >= 35) {
                        scored.push({ post: post, score: sc });
                    }
                }

                if (scored.length === 0) return [];

                scored.sort(function(a, b) { return b.score - a.score; });
                var targetPostId = scored[0].post._id;

                var playerUrl = API_BASE + "/player?postId=" + targetPostId + "&demo=0";

                return fetchWithTimeout(playerUrl, { headers: DEFAULT_HEADERS }, 2600)
                    .then(function(r) { return r && r.ok ? r.json() : null; })
                    .then(function(playerJson) {
                        var embeds = (playerJson && playerJson.data && playerJson.data.embeds) || [];
                        if (embeds.length === 0) return [];

                        var promises = embeds.map(function(item) {
                            var sUrl = item.url;
                            var lang = item.lang || "Latino";

                            return dispatchResolver(sUrl).then(function(stream) {
                                if (stream && stream.url) {
                                    return {
                                        name: "LaMovie",
                                        title: stream.quality + " · " + lang + " · " + stream.server,
                                        quality: stream.quality,
                                        url: stream.url,
                                        headers: stream.headers || {
                                            "User-Agent": USER_AGENT,
                                            "Referer": BASE_URL + "/"
                                        }
                                    };
                                }
                                return null;
                            });
                        });

                        return Promise.all(promises).then(function(results) {
                            var valid = [];
                            for (var v = 0; v < results.length; v++) {
                                if (results[v]) valid.push(results[v]);
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

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
}
