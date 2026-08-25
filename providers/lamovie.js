/**
 * Plugin de LaMovie (Películas y Series) para Nuvio Media Hub
 * Compatible con Android TV y FireTV (Hermes Engine - 100% Promise Chains)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var FAST_API = "https://lamovie.org/wp-api/v1";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://lamovie.org/"
};

// ==========================================
// 1. HELPERS & STRINGS (HERMES SAFE)
// ==========================================

function decodeHtmlEntities(str) {
    if (!str) return "";
    return str
        .replace(/&amp;/gi, " y ")
        .replace(/&quot;/gi, '"')
        .replace(/&#039;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function cleanTitle(str) {
    if (!str) return "";
    return decodeHtmlEntities(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scorePost(post, titles, year, isTv) {
    if (!post) return 0;
    var postTitle = cleanTitle(post.title || post.name || "");
    var postSlug = cleanTitle(post.slug || post.post_name || "");
    var score = 0;

    // 1. Coincidencia de título
    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        if (postTitle === t || postSlug === t) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (postTitle.indexOf(words[j]) !== -1 || postSlug.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0) {
            var ratio = (matches / words.length) * 70;
            if (matches > 0) {
                score = Math.max(score, ratio);
            }
        }
    }

    // Solo agregar bonificaciones si hubo coincidencia de título
    if (score > 0) {
        var pType = (post.post_type || post.type || "").toLowerCase();
        if (isTv && (pType.indexOf("tv") !== -1 || pType.indexOf("serie") !== -1)) {
            score += 15;
        } else if (!isTv && (pType.indexOf("movie") !== -1 || pType.indexOf("pelicula") !== -1)) {
            score += 15;
        }

        var postYear = String(post.year || post.release_date || post.date || post.title || "").match(/\b(19\d\d|20\d\d)\b/);
        var extractedYear = postYear ? postYear[1] : "";
        if (year && extractedYear && extractedYear === String(year)) {
            score += 20;
        }
    }

    return score;
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
            for (var i = 0; i < val.length; i++) {
                res = res * base + chars.indexOf(val[i]);
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

var QUALITY_MAPS = {
    vimeos:     { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" },
    goodstream: { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" }
};
var QUALITY_ORDER = ["x", "o", "h", "n", "l"];

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();
    
    var qMap = null;
    if (u.indexOf("goodstream") !== -1) qMap = QUALITY_MAPS.goodstream;
    else if (u.indexOf("vimeos") !== -1) qMap = QUALITY_MAPS.vimeos;
    
    if (qMap) {
        var urlsetMatch = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            for (var i = 0; i < QUALITY_ORDER.length; i++) {
                var tag = QUALITY_ORDER[i];
                if (tags.indexOf(tag) !== -1 && qMap[tag]) {
                    return qMap[tag];
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

    return fetch(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    })
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
// 4. RESOLVERS DE STREAMING
// ==========================================

function resolveVimeos(embedUrl) {
    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
    })
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
                    quality: q || "720p",
                    server: "Vimeos",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamWish(embedUrl) {
    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var fileMatch = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (fileMatch) streamUrl = fileMatch[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) streamUrl = m3u8[0].replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": embedUrl };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    server: "StreamWish",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveGoodStream(embedUrl) {
    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                     html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (direct) streamUrl = direct[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) streamUrl = m3u8[0].replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    server: "GoodStream",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 5. TMDB METADATA
// ==========================================

function getTMDBInfo(tmdbId, mediaType) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetch(url)
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

            var uniqueTitles = titles.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            return {
                title: isTv ? data.name : data.title,
                originalTitle: isTv ? data.original_name : data.original_title,
                titles: uniqueTitles,
                year: (data.release_date || data.first_air_date || "").substring(0, 4)
            };
        })
        .catch(function() { return null; });
}

// ==========================================
// 6. CONSULTAS A LA API REST DE LAMOVIE
// ==========================================

function searchMedia(query) {
    if (!query) return Promise.resolve([]);
    var searchUrl = FAST_API + "/search?postType=any&q=" + encodeURIComponent(query) + "&postsPerPage=15";
    return fetch(searchUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) { return res.json(); })
        .then(function(json) {
            return (json && json.data && json.data.posts) || (json && json.posts) || [];
        })
        .catch(function() { return []; });
}

function searchMultiQuery(queries) {
    function tryNext(idx) {
        if (idx >= queries.length) return Promise.resolve([]);
        return searchMedia(queries[idx]).then(function(posts) {
            if (posts && posts.length > 0) return posts;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

function getPlayerEmbeds(postItem, seasonNum, episodeNum, isTv) {
    var mainId = postItem._id || postItem.id;
    if (!mainId) return Promise.resolve([]);

    if (!isTv) {
        return fetch(FAST_API + "/player?postId=" + mainId + "&demo=0", { headers: DEFAULT_HEADERS })
            .then(function(res) { return res.json(); })
            .then(function(json) {
                return (json && json.data && json.data.embeds) || (json && json.embeds) || [];
            })
            .catch(function() { return []; });
    }

    var s = parseInt(seasonNum || 1, 10);
    var e = parseInt(episodeNum || 1, 10);
    var epListUrl = FAST_API + "/single/episodes/list?_id=" + mainId + "&season=" + s + "&page=1&postsPerPage=50";

    return fetch(epListUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) { return res.json(); })
        .then(function(epJson) {
            var posts = (epJson && epJson.data && epJson.data.posts) || (epJson && epJson.posts) || [];
            if (!Array.isArray(posts) || posts.length === 0) return [];

            var targetEpisode = null;
            for (var i = 0; i < posts.length; i++) {
                var p = posts[i];
                var epNum = parseInt(p.episode || p.episode_number || p.number || p.ep_num, 10);
                if (epNum === e) {
                    targetEpisode = p;
                    break;
                }
            }

            if (!targetEpisode && posts[e - 1]) {
                targetEpisode = posts[e - 1];
            }

            if (targetEpisode) {
                var epId = targetEpisode._id || targetEpisode.id;
                return fetch(FAST_API + "/player?postId=" + epId + "&demo=0", { headers: DEFAULT_HEADERS })
                    .then(function(pRes) { return pRes.json(); })
                    .then(function(pJson) {
                        return (pJson && pJson.data && pJson.data.embeds) || (pJson && pJson.embeds) || [];
                    });
            }
            return [];
        })
        .catch(function() { return []; });
}

// ==========================================
// 7. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return Promise.resolve([]);

    var isTv = mediaType === "tv" || mediaType === "series";
    var s = parseInt(seasonNum || 1, 10);
    var e = parseInt(episodeNum || 1, 10);

    return getTMDBInfo(tmdbId, mediaType).then(function(media) {
        if (!media || !media.titles || media.titles.length === 0) return [];

        var searchQueries = [];

        for (var i = 0; i < media.titles.length; i++) {
            var raw = media.titles[i];
            var clean = cleanTitle(raw);
            if (clean && searchQueries.indexOf(clean) === -1) searchQueries.push(clean);

            if (raw.indexOf("&") !== -1) {
                var withY = cleanTitle(raw.replace(/&/g, " y "));
                if (withY && searchQueries.indexOf(withY) === -1) searchQueries.push(withY);

                var withAnd = cleanTitle(raw.replace(/&/g, " and "));
                if (withAnd && searchQueries.indexOf(withAnd) === -1) searchQueries.push(withAnd);
            }

            var shortT = cleanTitle(raw.split(/[:\-\(]/)[0]);
            if (shortT && searchQueries.indexOf(shortT) === -1) searchQueries.push(shortT);

            var words = clean.split(/\s+/).filter(function(w) { return w.length > 3; });
            if (words.length > 0) {
                var mainWord = words[0];
                if (searchQueries.indexOf(mainWord) === -1) searchQueries.push(mainWord);
                if (words.length >= 2) {
                    var twoWords = words[0] + " " + words[1];
                    if (searchQueries.indexOf(twoWords) === -1) searchQueries.push(twoWords);
                }
            }
        }

        return searchMultiQuery(searchQueries).then(function(posts) {
            if (!posts || posts.length === 0) return [];

            // 1. Filtrar candidatos con umbral mínimo estricto (score >= 35)
            var scoredPosts = [];
            for (var p = 0; p < posts.length; p++) {
                var sc = scorePost(posts[p], media.titles, media.year, isTv);
                if (sc >= 35) {
                    scoredPosts.push({ post: posts[p], score: sc });
                }
            }

            // Si no hay coincidencias reales con el título, abortar
            if (scoredPosts.length === 0) {
                return [];
            }

            // 2. Ordenar candidatos por mayor precisión
            scoredPosts.sort(function(a, b) {
                return b.score - a.score;
            });

            // 3. Probar candidatos en cascada
            function tryCandidates(cIdx) {
                if (cIdx >= scoredPosts.length) return Promise.resolve([]);
                var currentPost = scoredPosts[cIdx].post;

                return getPlayerEmbeds(currentPost, s, e, isTv).then(function(embeds) {
                    if (!embeds || embeds.length === 0) {
                        return tryCandidates(cIdx + 1);
                    }

                    var resolvePromises = embeds.map(function(embed) {
                        var rawUrl = embed.url || embed.link || embed.embed || embed.code || embed.src || "";
                        if (!rawUrl) return Promise.resolve(null);

                        if (rawUrl.indexOf("<iframe") !== -1) {
                            var srcMatch = rawUrl.match(/src=["']([^"']+)["']/i);
                            if (srcMatch) rawUrl = srcMatch[1];
                        }

                        var u = rawUrl.toLowerCase();
                        var promise = null;

                        if (u.indexOf("vimeos") !== -1) {
                            promise = resolveVimeos(rawUrl);
                        } else if (u.indexOf("streamwish") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("hlswish") !== -1) {
                            promise = resolveStreamWish(rawUrl);
                        } else if (u.indexOf("goodstream") !== -1) {
                            promise = resolveGoodStream(rawUrl);
                        } else {
                            promise = Promise.resolve(null);
                        }

                        return promise.then(function(streamData) {
                            if (streamData && streamData.url) {
                                return {
                                    name: "LaMovie",
                                    title: streamData.quality + " · " + streamData.server + " (" + (embed.lang || "Latino") + ")",
                                    url: streamData.url,
                                    quality: streamData.quality,
                                    headers: streamData.headers || { "User-Agent": USER_AGENT, "Referer": rawUrl }
                                };
                            }
                            return null;
                        });
                    });

                    return Promise.all(resolvePromises).then(function(results) {
                        var streams = results.filter(function(st) { return st !== null; });
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
