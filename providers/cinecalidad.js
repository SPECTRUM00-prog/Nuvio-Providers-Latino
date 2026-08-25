/**
 * Plugin de CineCalidad (Películas y Series) para Nuvio Media Hub
 * Compatible con Android TV y FireTV (Hermes Engine - 100% Promise Chains)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://www.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ==========================================
// 1. HELPERS BASE64 & STRINGS (HERMES SAFE)
// ==========================================
function decodeB64(input) {
    if (!input) return null;
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(input).replace(/[=]+$/, "");
    if (str.length % 4 === 1) return null;
    var output = "";
    for (var bc = 0, bs = 0, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
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

// Filtro anti-falsos positivos (evita películas de la barra lateral como Enola Holmes)
function scoreCandidate(url, titles, year) {
    if (!url) return 0;
    var slug = url.replace(/\/$/, "").split("/").pop().toLowerCase().replace(/-/g, " ");
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        if (slug === t) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (slug.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0) {
            var ratio = (matches / words.length) * 80;
            // Solo puntúa si coincide al menos una palabra clave real
            if (matches > 0) {
                score = Math.max(score, ratio);
            }
        }
    }

    if (score > 0 && year && slug.indexOf(String(year)) !== -1) {
        score += 15;
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
// 4. RESOLVERS INDIVIDUALES
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
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                           unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
                if (m3u8) streamUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
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

function resolveStreamWish(embedUrl) {
    var id = embedUrl.replace(/\/$/, "").split("/").pop();
    var targetUrl = "https://hlswish.com/e/" + id;

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var fileMatch = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                        html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (fileMatch) streamUrl = fileMatch[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                           unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
                if (m3u8) streamUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": targetUrl };
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

function resolveFilemoon(embedUrl) {
    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var streamUrl = null;
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) streamUrl = direct[1].replace(/\\/g, "");

        if (!streamUrl) {
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                           unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
                if (m3u8) streamUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
            }
        }

        if (streamUrl) {
            var headers = { "User-Agent": USER_AGENT, "Referer": embedUrl };
            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "720p",
                    server: "Filemoon",
                    headers: headers
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveVideoApp(embedUrl) {
    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://www.cinecalidad.am/" }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i) ||
                          html.match(/src=["'](https?:\/\/[^"']+)["']/i);

        if (iframeMatch && iframeMatch[1]) {
            var inner = iframeMatch[1];
            if (inner.indexOf("vimeos") !== -1) return resolveVimeos(inner);
            if (inner.indexOf("goodstream") !== -1) return resolveGoodStream(inner);
            if (inner.indexOf("streamwish") !== -1 || inner.indexOf("hlswish") !== -1) return resolveStreamWish(inner);
            if (inner.indexOf("filemoon") !== -1) return resolveFilemoon(inner);
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 5. TMDB METADATA
// ==========================================
function getMediaData(tmdbId, mediaType) {
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
// 6. BUSCADOR EN CINECALIDAD
// ==========================================
function searchCinecalidad(query, isTv) {
    if (!query) return Promise.resolve([]);
    var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
    return fetch(searchUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var pattern = isTv ? /href=["']((?:https?:\/\/[^"']*)?\/(?:ver-serie|serie)\/[^"']+)["']/gi
                           : /href=["']((?:https?:\/\/[^"']*)?\/(?:ver-pelicula|pelicula)\/[^"']+)["']/gi;
        var matches = [];
        var m;
        while ((m = pattern.exec(html)) !== null) {
            var full = m[1];
            if (!full.startsWith("http")) full = BASE_URL + (full.startsWith("/") ? full : "/" + full);
            if (matches.indexOf(full) === -1) matches.push(full);
        }
        return matches;
    })
    .catch(function() { return []; });
}

function searchMultiQuery(queries, isTv) {
    function tryNext(idx) {
        if (idx >= queries.length) return Promise.resolve([]);
        return searchCinecalidad(queries[idx], isTv).then(function(results) {
            if (results && results.length > 0) return results;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

// ==========================================
// 7. EXTRAER ENLACES DEL HTML
// ==========================================
function extractEmbedsFromPage(pageUrl) {
    return fetch(pageUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
    })
    .then(function(res) {
        if (res.status !== 200) return [];
        return res.text();
    })
    .then(function(html) {
        if (!html) return [];
        var embeds = [];

        var optRegex = /(?:data-option|data-url|data-src)=["']([^"']+)["']/gi;
        var optMatch;
        while ((optMatch = optRegex.exec(html)) !== null) {
            var val = optMatch[1];
            if (val.indexOf("zopass=") !== -1) {
                var param = val.split("zopass=")[1].split("&")[0];
                var dec = decodeB64(param);
                if (dec && dec.startsWith("http")) embeds.push(dec);
            } else if (val.startsWith("http") && val.indexOf("youtube.com") === -1) {
                embeds.push(val);
            }
        }

        var linkRegex = /href=["'](https?:\/\/[^"']*(?:vimeos|goodstream|hlswish|streamwish|filemoon|videoapp)[^"']*)["']/gi;
        var lMatch;
        while ((lMatch = linkRegex.exec(html)) !== null) {
            if (embeds.indexOf(lMatch[1]) === -1) embeds.push(lMatch[1]);
        }

        return embeds.filter(function(item, pos, self) {
            return self.indexOf(item) === pos;
        });
    })
    .catch(function() { return []; });
}

function resolveEpisodePage(seriesUrl, sNum, eNum) {
    return fetch(seriesUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var s = parseInt(sNum, 10);
        var e = parseInt(eNum, 10);
        var epPadded = String(e).padStart(2, "0");

        var epRegex = new RegExp('href=["\']((?:https?:\\/\\/[^"\']*)?\\/(?:ver-el-episodio|episodio)\\/[^"\']*(?:-' + s + 'x' + e + '|-s' + s + 'e' + e + '|-s' + s + 'e' + epPadded + '|-' + s + 'x' + epPadded + ')[^"\']*)["\']', 'i');
        var match = html.match(epRegex);
        if (match && match[1]) {
            var found = match[1];
            if (!found.startsWith("http")) found = BASE_URL + (found.startsWith("/") ? found : "/" + found);
            return found;
        }

        var slug = seriesUrl.replace(/\/$/, "").split("/").pop();
        return BASE_URL + "/ver-el-episodio/" + slug + "-" + s + "x" + e + "/";
    })
    .catch(function() {
        var slug = seriesUrl.replace(/\/$/, "").split("/").pop();
        return BASE_URL + "/ver-el-episodio/" + slug + "-" + sNum + "x" + eNum + "/";
    });
}

// ==========================================
// 8. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
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

            if (raw.indexOf("&") !== -1) {
                var withY = cleanTitle(raw.replace(/&/g, " y "));
                if (withY && searchQueries.indexOf(withY) === -1) searchQueries.push(withY);
            }

            var shortT = cleanTitle(raw.split(/[:\-\(]/)[0]);
            if (shortT && searchQueries.indexOf(shortT) === -1) searchQueries.push(shortT);
        }

        return searchMultiQuery(searchQueries, isTv).then(function(urls) {
            if (!urls || urls.length === 0) return [];

            // 1. Filtrar con umbral estricto anti-falsos positivos (score >= 35)
            var scoredCandidates = [];
            for (var u = 0; u < urls.length; u++) {
                var sc = scoreCandidate(urls[u], media.titles, media.year);
                if (sc >= 35) {
                    scoredCandidates.push({ url: urls[u], score: sc });
                }
            }

            // Si ningún resultado coincide con el título real, abortar para no dar películas ajenas
            if (scoredCandidates.length === 0) {
                return [];
            }

            // 2. Ordenar candidatos por mayor precisión
            scoredCandidates.sort(function(a, b) {
                return b.score - a.score;
            });

            // 3. Probar candidatos válidos en cascada
            function tryCandidates(cIdx) {
                if (cIdx >= scoredCandidates.length) return Promise.resolve([]);
                var currentUrl = scoredCandidates[cIdx].url;

                var pagePromise = isTv ? resolveEpisodePage(currentUrl, s, e) : Promise.resolve(currentUrl);

                return pagePromise.then(function(targetPage) {
                    return extractEmbedsFromPage(targetPage);
                }).then(function(embeds) {
                    if (!embeds || embeds.length === 0) {
                        return tryCandidates(cIdx + 1);
                    }

                    var resolvePromises = embeds.map(function(embedUrl) {
                        var u = embedUrl.toLowerCase();
                        var promise = null;

                        if (u.indexOf("vimeos") !== -1) {
                            promise = resolveVimeos(embedUrl);
                        } else if (u.indexOf("goodstream") !== -1) {
                            promise = resolveGoodStream(embedUrl);
                        } else if (u.indexOf("streamwish") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("hlswish") !== -1) {
                            promise = resolveStreamWish(embedUrl);
                        } else if (u.indexOf("videoapp") !== -1) {
                            promise = resolveVideoApp(embedUrl);
                        } else if (u.indexOf("filemoon") !== -1) {
                            promise = resolveFilemoon(embedUrl);
                        } else {
                            promise = Promise.resolve(null);
                        }

                        return promise.then(function(stream) {
                            if (stream && stream.url) {
                                return {
                                    name: "CineCalidad",
                                    title: stream.quality + " · " + stream.server + " (Latino)",
                                    url: stream.url,
                                    quality: stream.quality,
                                    headers: stream.headers || {
                                        "User-Agent": USER_AGENT,
                                        "Referer": embedUrl
                                    }
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
