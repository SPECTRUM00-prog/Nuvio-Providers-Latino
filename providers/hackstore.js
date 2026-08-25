/**
 * Provider: Hackstore2 (Películas y Series)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://hackstore2.com";
const API_URL = `${BASE_URL}/api/rest`;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": `${BASE_URL}/`,
    "Origin": BASE_URL
};

// ==========================================
// UTILIDADES Y NORMALIZACIÓN
// ==========================================

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
// DETECCIÓN DINÁMICA DE RESOLUCIÓN REAL
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

function getServerLabel(url) {
    if (!url) return "Online";
    var u = url.toLowerCase();
    if (u.includes("vimeos")) return "Vimeos";
    if (u.includes("goodstream")) return "GoodStream";
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("strwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) return "StreamWish";
    if (u.includes("vidhide") || u.includes("minochinos")) return "VidHide";
    if (u.includes("filemoon")) return "Filemoon";
    if (u.includes("videoapp")) return "Videoapp";
    return "Servidor";
}

// ==========================================
// RESOLVERS DE STREAMING (PROMESAS PURAS)
// ==========================================

function resolveVimeos(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" },
        redirect: "follow"
    })
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
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" },
        redirect: "follow"
    })
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
    if (targetUrl.includes("hglink.to") || targetUrl.includes("hanerix.com")) {
        var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://hlswish.com/e/" + idMatch[1];
    }

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
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
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
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
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": url },
        redirect: "follow"
    })
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
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            var innerUrl = iframeMatch[1];
            return dispatchResolver(innerUrl);
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    if (u.includes("vimeos")) return resolveVimeos(url);
    if (u.includes("goodstream")) return resolveGoodStream(url);
    if (u.includes("hlswish") || u.includes("streamwish") || u.includes("strwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) return resolveStreamWish(url);
    if (u.includes("vidhide") || u.includes("minochinos")) return resolveVidHide(url);
    if (u.includes("filemoon")) return resolveFilemoon(url);
    if (u.includes("videoapp")) return resolveVideoApp(url);

    return Promise.resolve(null);
}

// ==========================================
// API REST DE HACKSTORE2
// ==========================================

function getPostId(slugs, postType) {
    var slugList = Array.isArray(slugs) ? slugs : [slugs];
    
    function tryNext(index) {
        if (index >= slugList.length) return Promise.resolve(null);
        var currentSlug = slugList[index];
        var endpoint = `${API_URL}/single?post_name=${encodeURIComponent(currentSlug)}&post_type=${postType}`;

        return fetch(endpoint, { headers: DEFAULT_HEADERS, redirect: "follow" })
            .then(function(res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function(json) {
                if (!json || !json.data) return tryNext(index + 1);
                if (postType === "movies" && json.data._id) return json.data._id;
                if (postType === "episodes" && json.data.episode && json.data.episode._id) return json.data.episode._id;
                if (json.data._id) return json.data._id;
                return tryNext(index + 1);
            })
            .catch(function() {
                return tryNext(index + 1);
            });
    }

    return tryNext(0);
}

function searchHackstoreApi(queries, titles, year) {
    var qList = Array.isArray(queries) ? queries : [queries];
    
    function tryNext(index) {
        if (index >= qList.length) return Promise.resolve([]);
        var q = qList[index];
        var searchUrl = `${API_URL}/search?q=${encodeURIComponent(q)}`;

        return fetch(searchUrl, { headers: DEFAULT_HEADERS })
            .then(function(res) {
                if (!res.ok) return [];
                return res.json();
            })
            .then(function(json) {
                var items = (json && json.data && Array.isArray(json.data)) ? json.data : [];
                var slugs = [];
                for (var i = 0; i < items.length; i++) {
                    var s = items[i].slug || items[i].post_name;
                    // Filtrar con score >= 35
                    if (s && scoreCandidate(s, titles, year) >= 35 && slugs.indexOf(s) === -1) {
                        slugs.push(s);
                    }
                }
                if (slugs.length > 0) return slugs;
                return tryNext(index + 1);
            })
            .catch(function() {
                return tryNext(index + 1);
            });
    }

    return tryNext(0);
}

function getPlayerEmbeds(postId) {
    var endpoint = `${API_URL}/player?post_id=${postId}`;
    return fetch(endpoint, { headers: DEFAULT_HEADERS, redirect: "follow" })
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
    console.log(`[Hackstore] Buscando TMDB ID ${tmdbId} (${mediaType})`);
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = parseInt(episode, 10) || 1;
    var epPadded = String(eNum).padStart(2, "0");
    var tmdbUrl = `https://api.themoviedb.org/3/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=alternative_titles`;

    return fetch(tmdbUrl)
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
                if (altArr[i].title) titles.push(altArr[i].title);
            }

            var uniqueTitles = titles.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            var searchQueries = [];
            var baseSlugs = [];

            for (var j = 0; j < uniqueTitles.length; j++) {
                var rawT = uniqueTitles[j];
                if (!rawT) continue;

                var clean = cleanTitle(rawT);
                if (clean && searchQueries.indexOf(clean) === -1) searchQueries.push(clean);

                var sNorm = normalizeText(rawT);
                if (sNorm && baseSlugs.indexOf(sNorm) === -1) baseSlugs.push(sNorm);

                if (rawT.indexOf("&") !== -1) {
                    var withY = normalizeText(rawT.replace(/&/g, " y "));
                    if (withY && baseSlugs.indexOf(withY) === -1) baseSlugs.push(withY);

                    var withAnd = normalizeText(rawT.replace(/&/g, " and "));
                    if (withAnd && baseSlugs.indexOf(withAnd) === -1) baseSlugs.push(withAnd);
                }

                var shortNorm = normalizeText(rawT.split(/[:\-\(]/)[0]);
                if (shortNorm && baseSlugs.indexOf(shortNorm) === -1) baseSlugs.push(shortNorm);
            }

            // Construir candidatos directos según tipo
            var candidateSlugs = [];
            for (var b = 0; b < baseSlugs.length; b++) {
                var bSlug = baseSlugs[b];
                if (isMovie) {
                    candidateSlugs.push(bSlug);
                    if (year) candidateSlugs.push(`${bSlug}-${year}`);
                } else {
                    candidateSlugs.push(`${bSlug}-temporada-${sNum}-episodio-${eNum}`);
                    candidateSlugs.push(`${bSlug}-temporada-${sNum}-capitulo-${eNum}`);
                    candidateSlugs.push(`${bSlug}-temporada-${sNum}-episodio-${epPadded}`);
                    candidateSlugs.push(`${bSlug}-temporada-${sNum}-capitulo-${epPadded}`);
                    candidateSlugs.push(`${bSlug}-${sNum}x${eNum}`);
                    candidateSlugs.push(`${bSlug}-${sNum}x${epPadded}`);
                }
            }

            var postType = isMovie ? "movies" : "episodes";
            return getPostId(candidateSlugs, postType).then(function(postId) {
                if (postId) return postId;

                // Fallback: Consultar API de búsqueda con filtro de score >= 35
                return searchHackstoreApi(searchQueries, uniqueTitles, year).then(function(foundSlugs) {
                    if (!foundSlugs.length) return null;

                    var fallbackSlugs = [];
                    for (var f = 0; f < foundSlugs.length; f++) {
                        var fSlug = foundSlugs[f];
                        if (isMovie) {
                            fallbackSlugs.push(fSlug);
                            if (year) fallbackSlugs.push(`${fSlug}-${year}`);
                        } else {
                            fallbackSlugs.push(`${fSlug}-temporada-${sNum}-episodio-${eNum}`);
                            fallbackSlugs.push(`${fSlug}-temporada-${sNum}-capitulo-${eNum}`);
                            fallbackSlugs.push(`${fSlug}-temporada-${sNum}-episodio-${epPadded}`);
                            fallbackSlugs.push(`${fSlug}-${sNum}x${eNum}`);
                        }
                    }

                    return getPostId(fallbackSlugs, postType);
                });
            });
        })
        .then(function(postId) {
            if (!postId) {
                console.log("[Hackstore] No se encontró el contenido en Hackstore2");
                return [];
            }
            console.log(`[Hackstore] Post ID encontrado: ${postId}`);
            return getPlayerEmbeds(postId);
        })
        .then(function(embeds) {
            if (!embeds.length) {
                console.log("[Hackstore] No se encontraron reproductores");
                return [];
            }
            console.log(`[Hackstore] Embeds encontrados: ${embeds.length}`);

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
                            title: `${qual} · ${lang.toUpperCase()} · ${serverName}`,
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
            var validStreams = results.filter(function(st) { return st !== null; });
            console.log(`[Hackstore] ✓ ${validStreams.length} streams válidos extraídos`);
            return validStreams;
        })
        .catch(function(err) {
            console.log(`[Hackstore] Error en flujo: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
