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
// 3. RESOLVERS INDIVIDUALES
// ==========================================
function resolveVimeos(embedUrl) {
    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var unpacked = unpackJS(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) ||
                            unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1].replace(/\\/g, ""),
                    quality: "1080p",
                    server: "Vimeos",
                    headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
                };
            }
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
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                     html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (direct) {
            return {
                url: direct[1],
                quality: "1080p",
                server: "GoodStream",
                headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" }
            };
        }
        var unpacked = unpackJS(html);
        if (unpacked) {
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                       unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (m3u8) {
                var streamUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
                return {
                    url: streamUrl,
                    quality: "1080p",
                    server: "GoodStream",
                    headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" }
                };
            }
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
        var fileMatch = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                        html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (fileMatch) {
            return {
                url: fileMatch[1],
                quality: "1080p",
                server: "StreamWish",
                headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
            };
        }
        var unpacked = unpackJS(html);
        if (unpacked) {
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                       unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (m3u8) {
                var streamUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
                return {
                    url: streamUrl,
                    quality: "1080p",
                    server: "StreamWish",
                    headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
                };
            }
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
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) {
            return {
                url: direct[1],
                quality: "1080p",
                server: "Filemoon",
                headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
            };
        }
        var unpacked = unpackJS(html);
        if (unpacked) {
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                       unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (m3u8) {
                var streamUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
                return {
                    url: streamUrl,
                    quality: "1080p",
                    server: "Filemoon",
                    headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
                };
            }
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

function resolveVOE(url, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 3) return Promise.resolve(null);

    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://cinecalidad.am/" }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
                         html.match(/location\.replace\(['"]([^'"]+)['"]\)/i);
        if (jsRedirect && jsRedirect[1] && jsRedirect[1] !== url) {
            var nextUrl = jsRedirect[1];
            if (nextUrl.startsWith("/")) nextUrl = new URL(url).origin + nextUrl;
            return resolveVOE(nextUrl, depth + 1);
        }

        var direct = html.match(/'hls'\s*:\s*['"]([^'"]+)['"]/i) || html.match(/"hls"\s*:\s*['"]([^'"]+)['"]/i);
        if (direct) {
            var streamUrl = direct[1];
            if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
            return { url: streamUrl, quality: "1080p", server: "VOE" };
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 4. TMDB METADATA
// ==========================================
function getMediaData(tmdbId, mediaType) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX";

    return fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            return {
                title: isTv ? data.name : data.title,
                originalTitle: isTv ? data.original_name : data.original_title,
                year: (data.release_date || data.first_air_date || "").substring(0, 4)
            };
        })
        .catch(function() { return null; });
}

// ==========================================
// 5. BUSCADOR EN CINECALIDAD
// ==========================================
function searchCinecalidad(query, isTv) {
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

// ==========================================
// 6. EXTRAER ENLACES DEL HTML
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

        // 1. Extraer data-option / data-url / data-src
        var optRegex = /(?:data-option|data-url|data-src)=["']([^"']+)["']/gi;
        var optMatch;
        while ((optMatch = optRegex.exec(html)) !== null) {
            var val = optMatch[1];
            if (val.indexOf("zopass=") !== -1) {
                var param = val.split("zopass=")[1].split("&")[0];
                var dec = decodeB64(param);
                if (dec && dec.startsWith("http")) embeds.push(dec);
            } else if (val.startsWith("http") && !val.includes("youtube.com")) {
                embeds.push(val);
            }
        }

        // 2. Extraer enlaces directos de botones o links
        var linkRegex = /href=["'](https?:\/\/[^"']*(?:vimeos|goodstream|hlswish|streamwish|filemoon|videoapp|voe)[^"']*)["']/gi;
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

// ==========================================
// 7. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    if (!tmdbId) return Promise.resolve([]);

    var isTv = mediaType === "tv" || mediaType === "series";

    return getMediaData(tmdbId, mediaType).then(function(media) {
        if (!media) return [];

        var rawTitle = media.title || media.originalTitle || "";
        var shortTitle = rawTitle.split(/[:\-\(]/)[0].trim();

        return searchCinecalidad(cleanTitle(shortTitle), isTv).then(function(urls) {
            if (urls.length === 0 && rawTitle !== shortTitle) {
                return searchCinecalidad(cleanTitle(rawTitle), isTv);
            }
            return urls;
        }).then(function(urls) {
            if (urls.length === 0 && media.originalTitle) {
                return searchCinecalidad(cleanTitle(media.originalTitle), isTv);
            }
            return urls;
        }).then(function(urls) {
            if (!urls || urls.length === 0) return [];

            var targetPage = urls[0];

            if (isTv) {
                var s = parseInt(seasonNum || 1, 10);
                var e = parseInt(episodeNum || 1, 10);
                var slug = targetPage.replace(/\/$/, "").split("/").pop();
                targetPage = BASE_URL + "/ver-el-episodio/" + slug + "-" + s + "x" + e + "/";
            }

            return extractEmbedsFromPage(targetPage).then(function(embeds) {
                if (embeds.length === 0 && isTv) {
                    var s = parseInt(seasonNum || 1, 10);
                    var e = parseInt(episodeNum || 1, 10);
                    var epPadded = String(e).padStart(2, "0");
                    var slug = urls[0].replace(/\/$/, "").split("/").pop();
                    var fallbackPage = BASE_URL + "/ver-el-episodio/" + slug + "-" + s + "x" + epPadded + "/";
                    return extractEmbedsFromPage(fallbackPage);
                }
                return embeds;
            });
        }).then(function(embeds) {
            if (!embeds || embeds.length === 0) return [];

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
                } else if (u.indexOf("voe") !== -1) {
                    promise = resolveVOE(embedUrl);
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
                var streams = [];
                for (var i = 0; i < results.length; i++) {
                    if (results[i]) streams.push(results[i]);
                }
                return streams;
            });
        });
    }).catch(function() {
        return [];
    });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
