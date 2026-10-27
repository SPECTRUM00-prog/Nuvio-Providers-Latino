/**
 * Provider: JKAnime (Anime Series, Películas, Donghua)
 * Motor: AniList GraphQL + Algoritmo Universal Split-Cour y Continuo (Agnóstico)
 * Correcciones: Unpacker universal, limpieza de guiones, batches en paralelo, género animación.
 * Reglas Hermes: ES5 estricto, 100% Promesas, Zero-Dependencies, Fast Timeout (<= 2800ms)
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var ANILIST_GRAPHQL = "https://graphql.anilist.co";
var BASE_URL = "https://jkanime.net";
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

function decodeBase64Safe(input) {
    if (!input) return "";
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(input).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4 !== 0) str += "=";
    
    var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
    str = str.replace(/[^A-Za-z0-9+/=]/g, "");

    while (i < str.length) {
        enc1 = b64.indexOf(str.charAt(i++));
        enc2 = b64.indexOf(str.charAt(i++));
        enc3 = b64.indexOf(str.charAt(i++));
        enc4 = b64.indexOf(str.charAt(i++));

        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;

        output += String.fromCharCode(chr1);
        if (enc3 !== 64 && enc3 !== -1) output += String.fromCharCode(chr2);
        if (enc4 !== 64 && enc4 !== -1) output += String.fromCharCode(chr3);
    }
    return output;
}

function cleanTitle(text) {
    if (!text) return "";
    var normalized = text;
    try {
        normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}

    return normalized
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .trim();
}

function cleanSlug(urlOrSlug) {
    if (!urlOrSlug) return "";
    var path = urlOrSlug.replace(/^https?:\/\/[^/]+/i, "").replace(/^\//, "").replace(/\/.*$/, "");
    return cleanTitle(path);
}

function hasAsianChars(str) {
    if (!str) return false;
    return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\uac00-\ud7af]/.test(str);
}

function getSeasonRank(text) {
    if (!text) return 1;
    var t = (" " + text.toLowerCase() + " ").replace(/[:\-_]/g, " ");
    if (t.indexOf(" season 4 ") !== -1 || t.indexOf(" 4th season ") !== -1 || t.indexOf(" iv ") !== -1 || t.indexOf(" final season ") !== -1) return 4;
    if (t.indexOf(" season 3 ") !== -1 || t.indexOf(" 3rd season ") !== -1 || t.indexOf(" iii ") !== -1) return 3;
    if (t.indexOf(" season 2 ") !== -1 || t.indexOf(" 2nd season ") !== -1 || t.indexOf(" ii ") !== -1) return 2;
    return 1;
}

function isPartTwo(text) {
    if (!text) return false;
    var t = text.toLowerCase();
    return t.indexOf("part 2") !== -1 || t.indexOf("part-2") !== -1 || t.indexOf("cour 2") !== -1 || t.indexOf("cour-2") !== -1;
}

// Detección estricta de marcadores estacionales evitando falsos positivos con palabras ("vinland", "violet")
function isSeasonalSlug(slug) {
    if (!slug) return false;
    var s = "-" + slug.toLowerCase() + "-";
    var markers = [
        "-season-", "-temporada-", "-part-", "-cour-",
        "-1st-", "-2nd-", "-3rd-", "-4th-", "-5th-", "-6th-",
        "-s1-", "-s2-", "-s3-", "-s4-", "-s5-",
        "-ii-", "-iii-", "-iv-", "-v-",
        "-movie-", "-pelicula-"
    ];
    for (var i = 0; i < markers.length; i++) {
        if (s.indexOf(markers[i]) !== -1) return true;
    }
    return false;
}

function scoreCandidate(candidateSlug, titles, year) {
    if (!candidateSlug) return 0;
    var cleanS = cleanSlug(candidateSlug).replace(/-/g, " ");
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]).replace(/-/g, " ");
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

// ==========================================
// 2. DESEMPAQUETADOR UNIVERSAL DEAN EDWARDS
// ==========================================

function unpackFromHtml(html) {
    if (!html) return "";
    var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\('\|'\)/);
    if (!packMatch) {
        packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
    }
    if (!packMatch) return "";

    var p = packMatch[1];
    var a = parseInt(packMatch[2], 10);
    var c = parseInt(packMatch[3], 10);
    var k = packMatch[4].split("|");

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

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();
    if (u.indexOf("vimeos") !== -1 || u.indexOf(".urlset") !== -1) {
        var urlsetMatch = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1) return "1080p";
            if (tags.indexOf("h") !== -1) return "720p";
            if (tags.indexOf("n") !== -1) return "480p";
            if (tags.indexOf("l") !== -1) return "360p";
        }
    }
    if (u.indexOf("4k") !== -1 || u.indexOf("2160") !== -1) return "4K";
    if (u.indexOf("1080") !== -1) return "1080p";
    if (u.indexOf("720") !== -1) return "720p";
    if (u.indexOf("480") !== -1) return "480p";
    return null;
}

function probeM3u8Quality(m3u8Url, headers) {
    var fastQ = detectQualityFromUrl(m3u8Url);
    if (fastQ) return Promise.resolve(fastQ);

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    return fetchWithTimeout(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" }, 2500)
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
            var maxH = 0, resRegex = /RESOLUTION=\d+x(\d+)/gi, match;
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
        .catch(function() { return "720p"; });
}

// ==========================================
// 3. MATEMÁTICAS UNIVERSALES DE EPISODIOS
// ==========================================

function calculateAbsoluteEp(seasons, sNum, eNum) {
    if (!seasons || seasons.length === 0 || sNum <= 1) return eNum;
    var totalPrevious = 0;
    for (var i = 0; i < seasons.length; i++) {
        var s = seasons[i];
        if (s.season_number > 0 && s.season_number < sNum) {
            totalPrevious += (s.episode_count || 0);
        }
    }
    return totalPrevious + eNum;
}

function decomposeAbsoluteEp(seasons, absEp) {
    if (!seasons || seasons.length === 0) return { season: 1, episode: absEp };
    var accumulated = 0;
    for (var i = 0; i < seasons.length; i++) {
        var s = seasons[i];
        if (s.season_number > 0) {
            var count = s.episode_count || 0;
            if (accumulated + count >= absEp) {
                return {
                    season: s.season_number,
                    episode: absEp - accumulated
                };
            }
            accumulated += count;
        }
    }
    return { season: 1, episode: absEp };
}

// ==========================================
// 4. ANILIST GRAPHQL
// ==========================================

function fetchAniListMapping(searchName) {
    if (!searchName || hasAsianChars(searchName)) return Promise.resolve([]);

    var gqlQuery = "query ($search: String) { Page(page: 1, perPage: 10) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { romaji english } synonyms episodes seasonYear format } } }";

    return fetchWithTimeout(ANILIST_GRAPHQL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ query: gqlQuery, variables: { search: searchName } })
    }, 2800)
    .then(function(res) { return res ? res.json() : null; })
    .then(function(json) {
        return (json && json.data && json.data.Page && json.data.Page.media) || [];
    })
    .catch(function() { return []; });
}

function resolveUniversalTarget(aniListMedia, sNum, eNum, absoluteEp) {
    if (!aniListMedia || aniListMedia.length === 0) return null;

    var seasonMatches = [];
    for (var i = 0; i < aniListMedia.length; i++) {
        var item = aniListMedia[i];
        var combinedTitle = (item.title.romaji || "") + " " + (item.title.english || "");
        var rank = getSeasonRank(combinedTitle);
        if (rank === sNum) {
            seasonMatches.push(item);
        }
    }

    if (seasonMatches.length === 0) {
        var baseEntry = aniListMedia[0];
        return {
            slug: cleanTitle(baseEntry.title.romaji),
            targetEp: sNum > 1 ? absoluteEp : eNum,
            isContinuous: true
        };
    }

    if (seasonMatches.length > 1) {
        var part1 = null;
        var part2 = null;

        for (var p = 0; p < seasonMatches.length; p++) {
            var name = (seasonMatches[p].title.romaji + " " + seasonMatches[p].title.english).toLowerCase();
            if (isPartTwo(name)) {
                part2 = seasonMatches[p];
            } else {
                part1 = seasonMatches[p];
            }
        }

        if (part1 && part2) {
            var p1Limit = part1.episodes || 12;
            if (eNum > p1Limit) {
                return {
                    slug: cleanTitle(part2.title.romaji),
                    targetEp: eNum - p1Limit,
                    isContinuous: false
                };
            } else {
                return {
                    slug: cleanTitle(part1.title.romaji),
                    targetEp: eNum,
                    isContinuous: false
                };
            }
        }
    }

    var selected = seasonMatches[0];
    return {
        slug: cleanTitle(selected.title.romaji),
        targetEp: eNum,
        isContinuous: false
    };
}

function searchJKAnime(query) {
    if (!query || hasAsianChars(query)) return Promise.resolve([]);
    var searchUrl = BASE_URL + "/buscar/" + encodeURIComponent(query) + "/";

    return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2800)
        .then(function(res) { return res && res.ok ? res.text() : ""; })
        .then(function(html) {
            var slugs = [];
            var regex = /href=["']https?:\/\/jkanime\.net\/([a-zA-Z0-9-]+)\/["']/gi;
            var match;

            while ((match = regex.exec(html)) !== null) {
                var s = match[1];
                if (s && s !== "buscar" && s !== "horario" && s !== "directorio" && slugs.indexOf(s) === -1) {
                    slugs.push(s);
                }
            }
            return slugs;
        })
        .catch(function() { return []; });
}

// ==========================================
// 5. RESOLVERS DE STREAMING ROBUSTOS
// ==========================================

function resolveStreamWish(url) {
    var idMatch = url.match(/\/(?:e|v|f)\/([a-zA-Z0-9]+)/);
    var targetUrl = idMatch ? "https://hlswish.com/e/" + idMatch[1] : url;

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl },
        redirect: "follow"
    }, 2800)
    .then(function(res) { return res ? res.text() : ""; })
    .then(function(html) {
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

function resolveVidHide(url) {
    var hostMatch = url.match(/^(https?:\/\/[^/]+)/i);
    var host = hostMatch ? hostMatch[1] : "https://callistanise.com";

    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? res.text() : ""; })
        .then(function(html) {
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
                if (streamUrl.indexOf("/") === 0) streamUrl = host + streamUrl;
                return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                    return { url: streamUrl, serverName: "VidHide", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveMp4upload(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? res.text() : ""; })
        .then(function(html) {
            if (!html) return null;

            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                               unpacked.match(/["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
                if (srcMatch) return { url: srcMatch[1], serverName: "MP4Upload", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
            var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
            if (directMatch) return { url: directMatch[0], serverName: "MP4Upload", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
            return null;
        })
        .catch(function() { return null; });
}

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (targetUrl.indexOf("http") !== 0) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");

    return fetchWithTimeout(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" }, 2500)
        .then(function(res) { return res ? res.text() : ""; })
        .then(function(html) {
            var match = html.match(/document\.getElementById\(['"](?:robotlink|ideoolink|noroot)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:\(['"]([^'"]+)['"]\)\.substring\((\d+)\)|['"]([^'"]+)['"])/i);
            if (match) {
                var p2 = (match[2] && match[3]) ? match[2].substring(parseInt(match[3], 10)) : (match[4] || "");
                var full = match[1] + p2;
                if (full.indexOf("//") === 0) full = "https:" + full;
                return { url: full, serverName: "Streamtape", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveDesuMagi(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? res.text() : ""; })
        .then(function(html) {
            var m3u8Match = html.match(/https?:\/\/[^"'\s\\]+playmudos\.com\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i) ||
                            html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
            if (m3u8Match) {
                return probeM3u8Quality(m3u8Match[0], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                    return { url: m3u8Match[0], serverName: "Desu", quality: q || "1080p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
            return null;
        })
        .catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("flaswish") !== -1) return resolveStreamWish(url);
    if (u.indexOf("vidhide") !== -1 || u.indexOf("morencius") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("callistanise") !== -1) return resolveVidHide(url);
    if (u.indexOf("mp4upload") !== -1) return resolveMp4upload(url);
    if (u.indexOf("streamtape") !== -1) return resolveStreamtape(url);
    if (u.indexOf("/jkplayer/") !== -1 || u.indexOf("playmudos") !== -1) return resolveDesuMagi(url);
    return Promise.resolve(null);
}

function extractStreamsFromEpisodePage(pageUrl) {
    return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, 2800)
        .then(function(res) { return res && res.ok ? res.text() : ""; })
        .then(function(html) {
            var rawEmbeds = [];

            var serversMatch = html.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
            if (serversMatch) {
                try {
                    var sArr = JSON.parse(serversMatch[1]);
                    for (var i = 0; i < sArr.length; i++) {
                        if (sArr[i] && sArr[i].remote) {
                            var dec = decodeBase64Safe(sArr[i].remote);
                            if (dec && dec.indexOf("http") === 0) rawEmbeds.push(dec);
                        }
                    }
                } catch (e) {}
            }

            var b64Tokens = html.match(/aHR0cHM6[a-zA-Z0-9+/=_-]+/gi) || [];
            for (var j = 0; j < b64Tokens.length; j++) {
                var d = decodeBase64Safe(b64Tokens[j]);
                if (d && d.indexOf("http") === 0) rawEmbeds.push(d);
            }

            var umRegex = /https?:\/\/jkanime\.net\/jkplayer\/(?:um|umv|uk)[^\s"'<>]+/gi, umMatch;
            while ((umMatch = umRegex.exec(html)) !== null) {
                rawEmbeds.push(umMatch[0].replace(/&amp;/g, "&"));
            }

            var uniqueEmbeds = [];
            for (var u = 0; u < rawEmbeds.length; u++) {
                if (uniqueEmbeds.indexOf(rawEmbeds[u]) === -1) {
                    uniqueEmbeds.push(rawEmbeds[u]);
                }
            }

            if (uniqueEmbeds.length === 0) return [];

            var promises = uniqueEmbeds.map(function(embedUrl) {
                return dispatchResolver(embedUrl)
                    .then(function(res) {
                        if (!res || !res.url) return null;
                        var q = res.quality || "720p";
                        return {
                            name: "JKAnime",
                            title: q + " · SUB · " + res.serverName,
                            quality: q,
                            url: res.url,
                            headers: res.headers || {}
                        };
                    })
                    .catch(function() { return null; });
            });

            return Promise.all(promises);
        })
        .then(function(results) {
            var valid = [];
            for (var i = 0; i < results.length; i++) {
                if (results[i]) valid.push(results[i]);
            }
            return valid;
        })
        .catch(function() { return []; });
}

// ==========================================
// 6. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = isMovie ? 1 : (parseInt(episode, 10) || 1);
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, null, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB HTTP Error");
            return res.json();
        })
        .then(function(meta) {
            // Exigir explícitamente género Animación (ID 16) para no procesar doramas o películas de acción real
            var isAnimation = false;
            if (meta.genres && Array.isArray(meta.genres)) {
                for (var g = 0; g < meta.genres.length; g++) {
                    if (meta.genres[g].id === 16) {
                        isAnimation = true;
                        break;
                    }
                }
            }
            if (!isAnimation) return [];

            var origLang = meta.original_language || "";
            var isAsianAnim = (origLang === "ja" || origLang === "zh" || origLang === "ko");
            if (!isAsianAnim && meta.origin_country) {
                for (var c = 0; c < meta.origin_country.length; c++) {
                    var co = meta.origin_country[c];
                    if (co === "JP" || co === "CN" || co === "KR" || co === "TW" || co === "HK") {
                        isAsianAnim = true;
                        break;
                    }
                }
            }
            if (!isAsianAnim) return [];

            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = (meta.release_date || meta.first_air_date || "").substring(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                var alt = altArr[i].title || "";
                if (alt && !hasAsianChars(alt) && titles.indexOf(alt) === -1) {
                    titles.push(alt);
                }
            }

            var cleanSearchTitle = "";
            if (origTitle && !hasAsianChars(origTitle)) {
                cleanSearchTitle = origTitle;
            } else if (title && !hasAsianChars(title)) {
                cleanSearchTitle = title;
            } else {
                for (var a = 0; a < altArr.length; a++) {
                    if (altArr[a].title && !hasAsianChars(altArr[a].title)) {
                        cleanSearchTitle = altArr[a].title;
                        break;
                    }
                }
            }
            if (!cleanSearchTitle) cleanSearchTitle = title || origTitle || "";

            var cleanT = cleanTitle(cleanSearchTitle).replace(/-/g, " ");
            var words = cleanT.split(/\s+/).filter(function(w) { return w.length > 2; });
            var searchKeyword = words.length >= 2 ? words.slice(0, 2).join(" ") : cleanT;

            // Búsqueda precisa de la temporada 1 descartando temporada 0 de especiales
            var seasonsList = meta.seasons || [];
            var s1Count = 60;
            for (var sIdx = 0; sIdx < seasonsList.length; sIdx++) {
                if (seasonsList[sIdx].season_number === 1) {
                    s1Count = seasonsList[sIdx].episode_count || 60;
                    break;
                }
            }
            
            var effectiveSeason = sNum;
            var effectiveEpisode = eNum;
            var absoluteEp = eNum;

            if (!isMovie) {
                if (sNum === 1 && eNum > s1Count && seasonsList.length > 1) {
                    absoluteEp = eNum;
                    var decomp = decomposeAbsoluteEp(seasonsList, eNum);
                    effectiveSeason = decomp.season;
                    effectiveEpisode = decomp.episode;
                } else {
                    absoluteEp = calculateAbsoluteEp(seasonsList, sNum, eNum);
                    effectiveSeason = sNum;
                    effectiveEpisode = eNum;
                }
            }

            return Promise.all([
                fetchAniListMapping(searchKeyword),
                searchJKAnime(searchKeyword)
            ]).then(function(results) {
                var aniListMedia = results[0];
                var nativeSlugs = results[1];

                var aniTarget = resolveUniversalTarget(aniListMedia, effectiveSeason, effectiveEpisode, absoluteEp);
                var candidateSlugs = [];

                if (aniTarget && aniTarget.slug) {
                    candidateSlugs.push({
                        slug: aniTarget.slug,
                        targetEp: aniTarget.targetEp,
                        isContinuous: aniTarget.isContinuous // Propagación corregida
                    });
                    if (year) {
                        candidateSlugs.push({
                            slug: aniTarget.slug + "-" + year,
                            targetEp: aniTarget.targetEp,
                            isContinuous: aniTarget.isContinuous
                        });
                    }
                }

                for (var n = 0; n < nativeSlugs.length; n++) {
                    var nSlug = nativeSlugs[n];
                    var exists = false;
                    for (var ex = 0; ex < candidateSlugs.length; ex++) {
                        if (candidateSlugs[ex].slug === nSlug) { exists = true; break; }
                    }
                    if (!exists) candidateSlugs.push({ slug: nSlug, targetEp: null, isContinuous: false });
                }

                for (var t = 0; t < titles.length; t++) {
                    var sBase = cleanTitle(titles[t]);
                    if (sBase) {
                        var ex1 = false;
                        for (var e1 = 0; e1 < candidateSlugs.length; e1++) {
                            if (candidateSlugs[e1].slug === sBase) { ex1 = true; break; }
                        }
                        if (!ex1) candidateSlugs.push({ slug: sBase, targetEp: null, isContinuous: false });

                        if (year) {
                            var sYear = sBase + "-" + year;
                            var ex2 = false;
                            for (var e2 = 0; e2 < candidateSlugs.length; e2++) {
                                if (candidateSlugs[e2].slug === sYear) { ex2 = true; break; }
                            }
                            if (!ex2) candidateSlugs.push({ slug: sYear, targetEp: null, isContinuous: false });
                        }
                    }
                }

                var scoredSlugs = [];
                for (var k = 0; k < candidateSlugs.length; k++) {
                    var cand = candidateSlugs[k];
                    var sc = scoreCandidate(cand.slug, titles, year);
                    if (sc >= 35) {
                        var slugRank = getSeasonRank(cand.slug);
                        if (slugRank === effectiveSeason) {
                            sc += 30;
                            if (isPartTwo(cand.slug) && effectiveEpisode > 12) sc += 15;
                            if (!isPartTwo(cand.slug) && effectiveEpisode <= 12) sc += 15;
                        } else if (effectiveSeason > 1 && slugRank === 1 && !cand.isContinuous) {
                            sc -= 30;
                        }
                        scoredSlugs.push({ slug: cand.slug, score: sc, targetEp: cand.targetEp, isContinuous: cand.isContinuous });
                    }
                }

                if (scoredSlugs.length === 0) return [];

                scoredSlugs.sort(function(a, b) { return b.score - a.score; });

                var pageUrlsToTry = [];
                for (var sIdx = 0; sIdx < scoredSlugs.length; sIdx++) {
                    var item = scoredSlugs[sIdx];
                    var curSlug = item.slug;

                    if (isMovie) {
                        pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/pelicula/");
                        pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/1/");
                    } else {
                        var isSeasonal = isSeasonalSlug(curSlug);

                        if (item.targetEp) {
                            pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + item.targetEp + "/");
                        }

                        if (isSeasonal) {
                            var seasonalEp = (isPartTwo(curSlug) && effectiveEpisode > 12) ? (effectiveEpisode - 12) : effectiveEpisode;
                            pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + seasonalEp + "/");
                            if (absoluteEp !== seasonalEp) {
                                pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + absoluteEp + "/");
                            }
                        } else {
                            if (effectiveSeason > 1 || absoluteEp > s1Count) {
                                pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + absoluteEp + "/");
                                pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + effectiveEpisode + "/");
                            } else {
                                pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + effectiveEpisode + "/");
                            }
                        }
                    }
                }

                var uniquePageUrls = [];
                for (var u = 0; u < pageUrlsToTry.length; u++) {
                    if (uniquePageUrls.indexOf(pageUrlsToTry[u]) === -1) {
                        uniquePageUrls.push(pageUrlsToTry[u]);
                    }
                }

                // Ejecución en paralelo por lotes pequeños (máximo 3 concurrentes) para cumplir Regla 4
                function tryBatch(urls, batchSize) {
                    if (urls.length === 0) return Promise.resolve([]);
                    var currentBatch = urls.slice(0, batchSize);
                    var remaining = urls.slice(batchSize);

                    var batchPromises = currentBatch.map(function(url) {
                        return extractStreamsFromEpisodePage(url);
                    });

                    return Promise.all(batchPromises).then(function(results) {
                        for (var r = 0; r < results.length; r++) {
                            if (results[r] && results[r].length > 0) return results[r];
                        }
                        return tryBatch(remaining, batchSize);
                    });
                }

                return tryBatch(uniquePageUrls, 3);
            });
        })
        .catch(function() {
            return [];
        });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
