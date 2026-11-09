/**
 * Provider: PelisForte (Películas y Series en Latino, Castellano y Sub)
 * Dominio: https://www2.pelisforte.se
 * Reemplazo oficial de PelisPlus
 * Motor: 100% Cadenas de Promesas (Hermes / FireTV / QuickJS Safe)
 * Características: Doblajes originales de cine (OK.ru CDN 1080p/720p directo), StreamWish y VidHide
 * Reglas Hermes: ES5 estricto, fetchWithTimeout preventivo con clearTimeout, cero dependencias.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://www2.pelisforte.se";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2500;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS DE RED & STRINGS (HERMES SAFE)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
            reject(new Error("Timeout tras " + limit + "ms: " + url));
        }, limit);

        fetch(url, options || {})
            .then(function(res) {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(function(err) {
                clearTimeout(timer);
                reject(err);
            });
    });
}

function padZero(num) {
    var n = parseInt(num, 10) || 0;
    return n < 10 ? "0" + n : String(n);
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

function cleanSlug(urlOrSlug) {
    if (!urlOrSlug) return "";
    var path = urlOrSlug.replace(/^https?:\/\/[^/]+/i, "");
    path = path.replace(/^\/(?:pelicula|serie|episodio)\//i, "").replace(/\/.*$/, "");
    return path.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreCandidate(slug, titles, year) {
    if (!slug) return 0;
    var cleanS = cleanSlug(slug);
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
// 2. DETECCIÓN DINÁMICA DE CALIDAD (REGLA 6)
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

// ==========================================
// 3. RESOLVERS DE STREAMING (OK.RU, WISH, HIDE)
// ==========================================

function resolveOkRu(htmlOrUrl) {
    var promise = htmlOrUrl.indexOf("data-options=") !== -1 ? 
                  Promise.resolve(htmlOrUrl) : 
                  fetchWithTimeout(htmlOrUrl.replace(/\/$/, ""), { headers: { "User-Agent": USER_AGENT }, redirect: "follow" }, 2200)
                      .then(function(res) { return res.ok ? res.text() : ""; })
                      .catch(function() { return ""; });

    return promise.then(function(html) {
        if (!html) return [];
        var match = html.match(/data-options=["']([^"']+)["']/);
        if (!match) return [];

        var decoded = match[1].replace(/&quot;/g, '"');
        var data;
        try {
            data = JSON.parse(decoded);
        } catch (e) {
            return [];
        }

        var rawMeta = data.flashvars && data.flashvars.metadata;
        var metadata = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;
        if (!metadata || !metadata.videos || !Array.isArray(metadata.videos)) return [];

        var qualMap = {
            "full": "1080p",
            "hd": "720p",
            "sd": "480p",
            "low": "360p",
            "lowest": "240p",
            "mobile": "144p"
        };

        var streams = [];
        // Priorizar las mejores calidades
        var preferred = ["full", "hd", "sd"];
        for (var p = 0; p < preferred.length; p++) {
            var targetName = preferred[p];
            for (var v = 0; v < metadata.videos.length; v++) {
                var vid = metadata.videos[v];
                if (vid.name === targetName) {
                    streams.push({
                        quality: qualMap[vid.name] || "720p",
                        url: vid.url,
                        server: "OK.ru",
                        headers: { "User-Agent": USER_AGENT, "Referer": "https://ok.ru/" }
                    });
                    break;
                }
            }
        }

        // Si no encontró las 3 primeras, añadir la que tenga
        if (streams.length === 0 && metadata.videos.length > 0) {
            var first = metadata.videos[0];
            streams.push({
                quality: qualMap[first.name] || "720p",
                url: first.url,
                server: "OK.ru",
                headers: { "User-Agent": USER_AGENT, "Referer": "https://ok.ru/" }
            });
        }

        return streams;
    });
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
    }, 2200)
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
                return [{
                    quality: q || "720p",
                    url: streamUrl,
                    server: "StreamWish",
                    headers: headers
                }];
            });
        }
        return [];
    })
    .catch(function() { return []; });
}

function resolveVidHide(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    }, 2200)
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
                return [{
                    quality: q || "720p",
                    url: streamUrl,
                    server: "VidHide",
                    headers: headers
                }];
            });
        }
        return [];
    })
    .catch(function() { return []; });
}

// ==========================================
// 4. BÚSQUEDA Y EXTRACCIÓN PELISFORTE
// ==========================================

function searchPelisForte(query) {
    var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);

    return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2400)
        .then(function(res) { return res.ok ? res.text() : ""; })
        .then(function(html) {
            var results = [];
            var seen = [];
            var linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']*\/(?:pelicula|serie)\/[^"']+)["'][^>]*>/gi;
            var m;

            while ((m = linkRegex.exec(html)) !== null) {
                var url = m[1];
                if (seen.indexOf(url) === -1) {
                    seen.push(url);
                    results.push(url);
                }
            }
            return results;
        })
        .catch(function() { return []; });
}

function resolveGatewayOption(item) {
    var rUrl = "https://mp4.nu/r.php?h=" + encodeURIComponent(item.token);

    return fetchWithTimeout(rUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://mp4.nu/" },
        redirect: "follow"
    }, 2400)
    .then(function(res) {
        var finalUrl = res.url || "";
        var htmlPromise = res.text();

        return htmlPromise.then(function(html) {
            if (finalUrl.indexOf("ok.ru") !== -1 || html.indexOf("data-options=") !== -1) {
                return resolveOkRu(html);
            }
            if (finalUrl.indexOf("streamwish") !== -1 || finalUrl.indexOf("hlswish") !== -1 || finalUrl.indexOf("hglink") !== -1) {
                return resolveStreamWish(finalUrl);
            }
            if (finalUrl.indexOf("vidhide") !== -1 || finalUrl.indexOf("morencius") !== -1) {
                return resolveVidHide(finalUrl);
            }
            return [];
        });
    })
    .then(function(streams) {
        return streams.map(function(s) {
            return {
                name: "PelisForte",
                title: s.quality + " · " + item.lang + " · " + s.server,
                quality: s.quality,
                url: s.url,
                headers: s.headers || {}
            };
        });
    })
    .catch(function() { return []; });
}

// ==========================================
// 5. FUNCIÓN PRINCIPAL EXPORTADA (getStreams)
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
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var queries = [];
            for (var t = 0; t < titles.length; t++) {
                var c = cleanTitle(titles[t]);
                if (c && queries.indexOf(c) === -1) queries.push(c);
            }

            function trySearch(idx) {
                if (idx >= queries.length) return Promise.resolve([]);
                return searchPelisForte(queries[idx]).then(function(links) {
                    if (links && links.length > 0) return links;
                    return trySearch(idx + 1);
                });
            }

            return trySearch(0).then(function(candidates) {
                var bestUrl = null;
                var bestScore = 0;

                for (var j = 0; j < candidates.length; j++) {
                    var candUrl = candidates[j];
                    var isCandMovie = candUrl.indexOf("/pelicula/") !== -1;
                    if (isMovie !== isCandMovie) continue;

                    var sc = scoreCandidate(candUrl, titles, year);
                    if (sc >= 35 && sc > bestScore) {
                        bestScore = sc;
                        bestUrl = candUrl;
                    }
                }

                if (!bestUrl) return null;

                // Si es serie, resolver la URL del episodio
                if (!isMovie) {
                    return fetchWithTimeout(bestUrl, { headers: DEFAULT_HEADERS }, 2400)
                        .then(function(sRes) { return sRes.ok ? sRes.text() : ""; })
                        .then(function(sHtml) {
                            var epRegex = new RegExp('href=["\'](https?:\\/\\/[^"\']*\\/episodio\\/[^"\']*(?:' + sNum + 'x' + eNum + '|' + sNum + 'x' + epPadded + ')[^"\']*)["\']', 'i');
                            var epMatch = sHtml.match(epRegex);
                            return epMatch ? epMatch[1] : null;
                        });
                }

                return bestUrl;
            });
        })
        .then(function(pageUrl) {
            if (!pageUrl) return [];

            return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, 2400)
                .then(function(res) { return res.ok ? res.text() : ""; })
                .then(function(html) {
                    // Extraer los iframes de mp4.nu
                    var ifrRegex = /id=["']options-(\d+)["'][^>]*>[\s\S]*?<iframe[^>]+src=["']https?:\/\/mp4\.nu\/\?h=([^"']+)["']/gi;
                    var tokensMap = {};
                    var m;

                    while ((m = ifrRegex.exec(html)) !== null) {
                        tokensMap[m[1]] = m[2];
                    }

                    // Extraer idiomas y opciones
                    var options = [];
                    var langBlocks = [
                        { id: "ln0", label: "LAT" },
                        { id: "ln1", label: "CAST" },
                        { id: "ln2", label: "SUB" }
                    ];

                    for (var l = 0; l < langBlocks.length; l++) {
                        var lb = langBlocks[l];
                        var blockIdx = html.indexOf('id="' + lb.id + '"');
                        if (blockIdx === -1) continue;
                        var blockHtml = html.substring(blockIdx, blockIdx + 1200);

                        var optRegex = /href=["']#options-(\d+)["'][^>]*>[\s\S]*?<span class=["']server["']>([^<]+)<\/span>/gi;
                        var optMatch;
                        while ((optMatch = optRegex.exec(blockHtml)) !== null) {
                            var optId = optMatch[1];
                            var serverName = optMatch[2].replace(/\s+/g, " ").trim();
                            if (tokensMap[optId]) {
                                options.push({
                                    optId: optId,
                                    token: tokensMap[optId],
                                    lang: lb.label,
                                    server: serverName
                                });
                            }
                        }
                    }

                    // Priorizar Latino primero
                    options.sort(function(a, b) {
                        if (a.lang === "LAT" && b.lang !== "LAT") return -1;
                        if (b.lang === "LAT" && a.lang !== "LAT") return 1;
                        return 0;
                    });

                    // Limitar a las mejores 3 opciones para no saturar timeouts
                    var selected = options.slice(0, 3);
                    var promises = selected.map(function(item) {
                        return resolveGatewayOption(item);
                    });

                    return Promise.all(promises);
                })
                .then(function(results) {
                    var flat = [];
                    for (var r = 0; r < results.length; r++) {
                        if (Array.isArray(results[r])) {
                            flat = flat.concat(results[r]);
                        }
                    }
                    return flat;
                });
        })
        .catch(function() {
            return [];
        });
}

module.exports = { getStreams: getStreams };
