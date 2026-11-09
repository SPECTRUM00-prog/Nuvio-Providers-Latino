/**
 * Provider: Hackstore2 (Películas y Series)
 * Motor: 100% Cadenas de Promesas (Hermes / QuickJS / Android TV / FireTV Safe)
 * Optimización: Búsqueda concurrente en lotes y priorización de títulos originales para series.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://hackstore2.com";
var API_URL = BASE_URL + "/api/rest";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL
};

// ==========================================
// CONTROL DE CONCURRENCIA Y TIMEOUTS (REGLA 4)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var timeout = timeoutMs || 2500;
    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
            reject(new Error("Timeout tras " + timeout + "ms: " + url));
        }, timeout);

        fetch(url, options || {})
            .then(function(response) {
                clearTimeout(timer);
                resolve(response);
            })
            .catch(function(err) {
                clearTimeout(timer);
                reject(err);
            });
    });
}

// ==========================================
// UTILIDADES Y NORMALIZACIÓN (REGLAS 5 Y 7)
// ==========================================

function padZero(num) {
    var n = parseInt(num, 10) || 0;
    return n < 10 ? "0" + n : String(n);
}

function normalizeText(text) {
    if (!text) return "";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
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

function scoreCandidate(slug, titles, year) {
    if (!slug) return 0;
    var cleanS = cleanTitle(slug);
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        if (cleanS === t) {
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

// ==========================================
// DETECCIÓN DINÁMICA DE RESOLUCIÓN (REGLA 6)
// ==========================================

var QUALITY_MAPS = {
    vimeos:     { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" },
    goodstream: { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" },
    vidhide:    { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" },
    streamwish: { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" }
};

var QUALITY_ORDER = ["x", "o", "h", "n", "l"];

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();

    var qMap = null;
    if (u.indexOf("goodstream") !== -1) qMap = QUALITY_MAPS.goodstream;
    else if (u.indexOf("vimeos") !== -1) qMap = QUALITY_MAPS.vimeos;
    else if (u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1) qMap = QUALITY_MAPS.vidhide;
    else if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("vibuxer") !== -1) qMap = QUALITY_MAPS.streamwish;

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

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2400)
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

        var maxW = 0;
        var maxH = 0;
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
    if (u.indexOf("vimeos") !== -1) return "Vimeos";
    if (u.indexOf("goodstream") !== -1) return "GoodStream";
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("vibuxer") !== -1) return "StreamWish";
    if (u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1) return "VidHide";
    if (u.indexOf("filemoon") !== -1) return "Filemoon";
    if (u.indexOf("videoapp") !== -1) return "Videoapp";
    return "Servidor";
}

// ==========================================
// RESOLVERS DE STREAMING (PROMESAS PURAS)
// ==========================================

function resolveVimeos(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" },
        redirect: "follow"
    }, 2400)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }
        if (!streamUrl) {
            var directMatch = html.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (directMatch) streamUrl = directMatch[1];
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    headers: headers
                };
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
    }, 2400)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var fileMatch = html.match(/file:\s*"([^"]+)"/i);
        if (fileMatch) streamUrl = fileMatch[1];

        if (!streamUrl) {
            var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
            if (packMatch) {
                var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
                var m3u8 = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
                if (m3u8) streamUrl = m3u8[1];
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": url, "Origin": "https://goodstream.one" };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url) {
    var targetUrl = url;
    if (targetUrl.indexOf("hglink.to") !== -1 || targetUrl.indexOf("hanerix.com") !== -1) {
        var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://hlswish.com/e/" + idMatch[1];
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    }, 2400)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }
        if (!streamUrl) {
            var directMatch = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
            if (directMatch) streamUrl = directMatch[0];
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": "https://hlswish.com/" };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveVidHide(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    }, 2400)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveFilemoon(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": url },
        redirect: "follow"
    }, 2400)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveVideoApp(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, 2400)
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            return dispatchResolver(iframeMatch[1]);
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    if (u.indexOf("vimeos") !== -1) return resolveVimeos(url);
    if (u.indexOf("goodstream") !== -1) return resolveGoodStream(url);
    if (u.indexOf("hlswish") !== -1 || u.indexOf("streamwish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("vibuxer") !== -1) return resolveStreamWish(url);
    if (u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1) return resolveVidHide(url);
    if (u.indexOf("filemoon") !== -1) return resolveFilemoon(url);
    if (u.indexOf("videoapp") !== -1) return resolveVideoApp(url);

    return Promise.resolve(null);
}

// ==========================================
// CLIENTE API REST (CONCURRENTE EN LOTES)
// ==========================================

function getPostId(slugs, postType) {
    var slugList = Array.isArray(slugs) ? slugs : [slugs];
    if (slugList.length === 0) return Promise.resolve(null);

    // Búsqueda en lotes concurrentes de 3 para evitar acumulación de latencia
    var batchSize = 3;
    function tryBatch(startIndex) {
        if (startIndex >= slugList.length) return Promise.resolve(null);
        var currentBatch = slugList.slice(startIndex, startIndex + batchSize);

        var promises = currentBatch.map(function(slug) {
            var endpoint = API_URL + "/single?post_name=" + encodeURIComponent(slug) + "&post_type=" + postType;
            return fetchWithTimeout(endpoint, { headers: DEFAULT_HEADERS, redirect: "follow" }, 2200)
                .then(function(res) {
                    if (!res.ok) return null;
                    return res.json();
                })
                .then(function(json) {
                    if (!json || !json.data) return null;
                    var d = json.data;
                    if (postType === "episodes" && d.episode && d.episode._id) return d.episode._id;
                    if (d._id) return d._id;
                    return null;
                })
                .catch(function() { return null; });
        });

        return Promise.all(promises).then(function(results) {
            for (var i = 0; i < results.length; i++) {
                if (results[i]) return results[i];
            }
            return tryBatch(startIndex + batchSize);
        });
    }

    return tryBatch(0);
}

function searchHackstoreApi(queries, titles, year, postType) {
    var qList = Array.isArray(queries) ? queries : [queries];
    var pType = postType || "movies";

    function tryNext(index) {
        if (index >= qList.length) return Promise.resolve(null);
        var q = qList[index];
        var cleanQ = q.length > 15 ? q.substring(0, 15) : q;
        if (cleanQ.length < 3) return tryNext(index + 1);

        var searchUrl = API_URL + "/search?post_type=" + pType + "&query=" + encodeURIComponent(cleanQ);

        return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2200)
            .then(function(res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function(json) {
                var posts = (json && json.data && Array.isArray(json.data.posts)) ? json.data.posts : [];
                var bestId = null;
                var bestScore = 0;

                for (var i = 0; i < posts.length; i++) {
                    var p = posts[i];
                    var s = p.slug || p.post_name || p.title;
                    var sc = scoreCandidate(s, titles, year);
                    if (sc >= 35 && sc > bestScore) {
                        bestScore = sc;
                        bestId = p._id;
                    }
                }

                if (bestId) return bestId;
                return tryNext(index + 1);
            })
            .catch(function() {
                return tryNext(index + 1);
            });
    }

    return tryNext(0);
}

function getPlayerEmbeds(postId) {
    var endpoint = API_URL + "/player?post_id=" + postId;
    return fetchWithTimeout(endpoint, { headers: DEFAULT_HEADERS, redirect: "follow" }, 2200)
        .then(function(res) {
            if (!res.ok) return [];
            return res.json();
        })
        .then(function(json) {
            return (json && json.data && Array.isArray(json.data)) ? json.data : [];
        })
        .catch(function() { return []; });
}

// ==========================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = parseInt(episode, 10) || 1;
    var epPadded = padZero(eNum);
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, {}, 2400)
        .then(function(res) {
            if (!res.ok) throw new Error("TMDB HTTP " + res.status);
            return res.json();
        })
        .then(function(meta) {
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = (isMovie ? meta.release_date : meta.first_air_date || "").slice(0, 4);

            var titles = [];
            // En series, poner el título original (inglés) de primero porque Hackstore usa slugs originales
            if (!isMovie && origTitle) {
                titles.push(origTitle);
                if (title && title !== origTitle) titles.push(title);
            } else {
                if (title) titles.push(title);
                if (origTitle && origTitle !== title) titles.push(origTitle);
            }

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var searchQueries = [];
            var fullSlugs = [];
            var shortSlugs = [];

            for (var j = 0; j < titles.length; j++) {
                var rawT = titles[j];
                if (!rawT) continue;

                var clean = cleanTitle(rawT);
                if (clean && searchQueries.indexOf(clean) === -1) searchQueries.push(clean);

                var sNorm = normalizeText(rawT);
                if (sNorm && fullSlugs.indexOf(sNorm) === -1) fullSlugs.push(sNorm);

                if (rawT.indexOf("&") !== -1) {
                    var withY = normalizeText(rawT.replace(/&/g, " y "));
                    if (withY && fullSlugs.indexOf(withY) === -1) fullSlugs.push(withY);

                    var withAnd = normalizeText(rawT.replace(/&/g, " and "));
                    if (withAnd && fullSlugs.indexOf(withAnd) === -1) fullSlugs.push(withAnd);
                }

                var shortNorm = normalizeText(rawT.split(/[:\-\(]/)[0]);
                if (shortNorm && shortSlugs.indexOf(shortNorm) === -1 && fullSlugs.indexOf(shortNorm) === -1) {
                    shortSlugs.push(shortNorm);
                }
            }

            // Los slugs completos van primero; los recortados al final como último recurso
            var baseSlugs = fullSlugs.concat(shortSlugs);

            // Generar candidatos ordenados por probabilidad
            var candidateSlugs = [];
            for (var b = 0; b < baseSlugs.length; b++) {
                var bSlug = baseSlugs[b];
                if (isMovie) {
                    candidateSlugs.push(bSlug);
                    if (year) candidateSlugs.push(bSlug + "-" + year);
                } else {
                    candidateSlugs.push(bSlug + "-temporada-" + sNum + "-episodio-" + eNum);
                    candidateSlugs.push(bSlug + "-temporada-" + sNum + "-episodio-" + epPadded);
                    candidateSlugs.push(bSlug + "-" + sNum + "x" + eNum);
                    candidateSlugs.push(bSlug + "-" + sNum + "x" + epPadded);
                }
            }

            var postType = isMovie ? "movies" : "episodes";
            return getPostId(candidateSlugs, postType).then(function(postId) {
                if (postId) return postId;

                if (isMovie) {
                    return searchHackstoreApi(searchQueries, titles, year, "movies");
                }
                return null;
            });
        })
        .then(function(postId) {
            if (!postId) return [];
            return getPlayerEmbeds(postId);
        })
        .then(function(embeds) {
            if (!embeds.length) return [];

            var promises = embeds.map(function(embed) {
                var url = embed.url || embed.link || "";
                var lang = embed.lang || embed.language || "LAT";
                var serverName = getServerLabel(url);

                return dispatchResolver(url)
                    .then(function(result) {
                        if (!result || !result.url) return null;
                        var qual = result.quality || "720p";
                        return {
                            name: "Hackstore",
                            title: qual + " · " + lang.toUpperCase() + " · " + serverName,
                            quality: qual,
                            url: result.url,
                            headers: result.headers || {}
                        };
                    })
                    .catch(function() { return null; });
            });

            return Promise.all(promises);
        })
        .then(function(results) {
            return results.filter(function(st) { return st !== null; });
        })
        .catch(function() {
            return [];
        });
}

module.exports = { getStreams: getStreams };
