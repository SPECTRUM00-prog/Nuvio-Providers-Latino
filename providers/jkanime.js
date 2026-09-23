/**
 * Provider: JKAnime (Anime, Donghua y Películas)
 * Motor: AniList GraphQL + Algoritmo Universal Split-Cour y Continuo (Agnóstico)
 * Soporte Completo: TMDB, Cinemeta y Kitsu sin dependencias y 100% Hermes Safe
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var ANILIST_GRAPHQL = "https://graphql.anilist.co";
var BASE_URL = "https://jkanime.net";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 3200;

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
    return Promise.race([
        fetch(url, options),
        new Promise(function(_, reject) {
            setTimeout(function() {
                reject(new Error("Timeout"));
            }, limit);
        })
    ]);
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
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
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

// Clasificador universal de temporada por número romano, cardinal u ordinal
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

function isSeasonalSlug(slug) {
    if (!slug) return false;
    var s = slug.toLowerCase();
    var markers = [
        "-season-", "-temporada-", "-part-", "-cour-",
        "-1st", "-2nd", "-3rd", "-4th", "-5th", "-6th",
        "-s1", "-s2", "-s3", "-s4", "-s5",
        "-ii", "-iii", "-iv", "-v",
        "-movie", "-pelicula"
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

function probeM3u8Quality(m3u8Url, headers) {
    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");
    return fetchWithTimeout(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" }, 2500)
        .then(function(res) { return res.ok ? res.text() : ""; })
        .then(function(text) {
            if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
                if (/1080/i.test(m3u8Url)) return "1080p";
                if (/720/i.test(m3u8Url)) return "720p";
                return "720p";
            }
            var maxH = 0, resRegex = /RESOLUTION=\d+x(\d+)/gi, match;
            while ((match = resRegex.exec(text)) !== null) {
                var h = parseInt(match[1], 10);
                if (h > maxH) maxH = h;
            }
            if (maxH >= 1080) return "1080p";
            if (maxH >= 720) return "720p";
            if (maxH >= 480) return "480p";
            return "720p";
        })
        .catch(function() { return "720p"; });
}

// ==========================================
// 2. MATEMÁTICAS UNIVERSALES DE EPISODIOS
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
// 3. ANILIST GRAPHQL: RESOLUTOR SPLIT-COUR
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
    .then(function(res) { return res.json(); })
    .then(function(json) {
        return (json && json.data && json.data.Page && json.data.Page.media) || [];
    })
    .catch(function() { return []; });
}

function resolveUniversalTarget(aniListMedia, sNum, eNum, absoluteEp) {
    if (!aniListMedia || aniListMedia.length === 0) return null;

    // 1. Filtrar los animes que pertenecen exactamente a la temporada solicitada
    var seasonMatches = [];
    for (var i = 0; i < aniListMedia.length; i++) {
        var item = aniListMedia[i];
        var combinedTitle = (item.title.romaji || "") + " " + (item.title.english || "");
        var rank = getSeasonRank(combinedTitle);
        if (rank === sNum) {
            seasonMatches.push(item);
        }
    }

    // Si no hay temporada específica, tomar el slug base continuo (One Piece, Conan, etc.)
    if (seasonMatches.length === 0) {
        var baseEntry = aniListMedia[0];
        return {
            slug: cleanTitle(baseEntry.title.romaji),
            targetEp: sNum > 1 ? absoluteEp : eNum,
            isContinuous: true
        };
    }

    // 2. Manejo Universal de Split-Cours (Parte 1 vs Parte 2)
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

        // Si la temporada está dividida en dos bloques de emisión:
        if (part1 && part2) {
            var p1Limit = part1.episodes || 12;
            if (eNum > p1Limit) {
                return {
                    slug: cleanTitle(part2.title.romaji),
                    targetEp: eNum - p1Limit, // Ej. 16 - 12 = Episodio 4
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

    // 3. Temporada normal de un solo bloque (ej. Jujutsu Kaisen S2)
    var selected = seasonMatches[0];
    return {
        slug: cleanTitle(selected.title.romaji),
        targetEp: eNum,
        isContinuous: false
    };
}

// ==========================================
// 4. BUSCADOR NATIVO DE JKANIME
// ==========================================

function searchJKAnime(query) {
    if (!query || hasAsianChars(query)) return Promise.resolve([]);
    var searchUrl = BASE_URL + "/buscar/" + encodeURIComponent(query) + "/1/";

    return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2800)
        .then(function(res) { return res.ok ? res.text() : ""; })
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
// 5. RESOLVERS DE STREAMING (HERMES SAFE)
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
        var unpacked = unpackDeanEdwards(html);
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
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }, redirect: "follow" }, 2800)
        .then(function(res) {
            if (!res) return null;
            var finalUrl = res.url || url;
            var hostMatch = finalUrl.match(/^(https?:\/\/[^/]+)/i);
            var host = hostMatch ? hostMatch[1] : "https://callistanise.com";
            return res.text().then(function(html) {
                var streamUrl = null;
                var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
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
                    if (streamUrl.indexOf("/") === 0) streamUrl = host + streamUrl;
                    return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": finalUrl }).then(function(q) {
                        return { url: streamUrl, serverName: "VidHide", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": finalUrl } };
                    });
                }
                return null;
            });
        }).catch(function() { return null; });
}

function resolveMp4upload(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" }, redirect: "follow" }, 2800)
        .then(function(res) { return res.text(); })
        .then(function(html) {
            if (!html) return null;
            var quality = "1080p";
            if (html.indexOf("FHD") !== -1 || html.indexOf("1080") !== -1) {
                quality = "1080p";
            } else if (html.indexOf("HD") !== -1 || html.indexOf("720") !== -1) {
                quality = "720p";
            } else if (html.indexOf("SD") !== -1 || html.indexOf("480") !== -1) {
                quality = "480p";
            }

            var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
            if (packMatch) {
                var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
                var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                               unpacked.match(/["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
                if (srcMatch) return { url: srcMatch[1], serverName: "MP4Upload", quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
            var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
            if (directMatch) return { url: directMatch[0], serverName: "MP4Upload", quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            return null;
        }).catch(function() { return null; });
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
                return { url: "https:" + match[1] + p2, serverName: "Streamtape", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            }
            return null;
        }).catch(function() { return null; });
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
        }).catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("sfasthwish") !== -1 || u.indexOf("flaswish") !== -1 || u.indexOf("fasthwish") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("vibuxer") !== -1) return resolveStreamWish(url);
    if (u.indexOf("vidhide") !== -1 || u.indexOf("vidhidevip") !== -1 || u.indexOf("callistanise") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("filelions") !== -1 || u.indexOf("morencius") !== -1) return resolveVidHide(url);
    if (u.indexOf("mp4upload") !== -1) return resolveMp4upload(url);
    if (u.indexOf("streamtape") !== -1) return resolveStreamtape(url);
    if (u.indexOf("/jkplayer/") !== -1 || u.indexOf("playmudos") !== -1) return resolveDesuMagi(url);
    return Promise.resolve(null);
}

function extractStreamsFromEpisodePage(pageUrl) {
    return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, 3000)
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
            if (!res.ok) throw new Error("TMDB HTTP " + res.status);
            return res.json();
        })
        .then(function(meta) {
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

            var cleanT = cleanTitle(origTitle || title).replace(/-/g, " ");
            var words = cleanT.split(/\s+/).filter(function(w) { return w.length > 2; });
            var searchKeyword = words.length >= 2 ? words.slice(0, 2).join(" ") : cleanT;

            // RESOLUCIÓN MATEMÁTICA UNIVERSAL DE TEMPORADAS Y EPISODIOS
            var seasonsList = meta.seasons || [];
            var s1Count = (seasonsList[0] && seasonsList[0].episode_count) || 60;
            
            var effectiveSeason = sNum;
            var effectiveEpisode = eNum;
            var absoluteEp = eNum;

            if (!isMovie) {
                // Caso Kitsu: Manda Temporada 1 pero con número de episodio global acumulado
                if (sNum === 1 && eNum > s1Count && seasonsList.length > 1) {
                    absoluteEp = eNum;
                    var decomp = decomposeAbsoluteEp(seasonsList, eNum);
                    effectiveSeason = decomp.season;
                    effectiveEpisode = decomp.episode;
                } else {
                    // Caso TMDB / Cinemeta: Manda Temporada N y Episodio dentro de la temporada
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

                // El resolver universal calcula el slug exacto de la parte (y el targetEp reseteado)
                var aniTarget = resolveUniversalTarget(aniListMedia, effectiveSeason, effectiveEpisode, absoluteEp);
                var candidateSlugs = [];

                if (aniTarget && aniTarget.slug) {
                    candidateSlugs.push({ slug: aniTarget.slug, targetEp: aniTarget.targetEp });
                    if (year) candidateSlugs.push({ slug: aniTarget.slug + "-" + year, targetEp: aniTarget.targetEp });
                }

                for (var n = 0; n < nativeSlugs.length; n++) {
                    var nSlug = nativeSlugs[n];
                    var exists = false;
                    for (var ex = 0; ex < candidateSlugs.length; ex++) {
                        if (candidateSlugs[ex].slug === nSlug) { exists = true; break; }
                    }
                    if (!exists) candidateSlugs.push({ slug: nSlug, targetEp: null });
                }

                for (var t = 0; t < titles.length; t++) {
                    var sBase = cleanTitle(titles[t]);
                    if (sBase) {
                        var ex1 = false;
                        for (var e1 = 0; e1 < candidateSlugs.length; e1++) {
                            if (candidateSlugs[e1].slug === sBase) { ex1 = true; break; }
                        }
                        if (!ex1) candidateSlugs.push({ slug: sBase, targetEp: null });

                        if (year) {
                            var sYear = sBase + "-" + year;
                            var ex2 = false;
                            for (var e2 = 0; e2 < candidateSlugs.length; e2++) {
                                if (candidateSlugs[e2].slug === sYear) { ex2 = true; break; }
                            }
                            if (!ex2) candidateSlugs.push({ slug: sYear, targetEp: null });
                        }
                    }
                }

                var scoredSlugs = [];
                for (var k = 0; k < candidateSlugs.length; k++) {
                    var cand = candidateSlugs[k];
                    var sc = scoreCandidate(cand.slug, titles, year);
                    if (sc >= 35) {
                        scoredSlugs.push({ slug: cand.slug, score: sc, targetEp: cand.targetEp });
                    }
                }

                if (scoredSlugs.length === 0) return [];

                scoredSlugs.sort(function(a, b) { return b.score - a.score; });

                // CONSTRUCCIÓN INTELIGENTE DE RUTAS DE EPISODIO
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
                            // Si AniList resolvió el offset matemático del Split-Cour, este va de PRIMERO
                            pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + item.targetEp + "/");
                        }

                        if (isSeasonal) {
                            // Slug de Temporada/Parte (Mushoku Tensei T2 P2):
                            // Si es una parte 2 y no tenía targetEp calculado, aplicar el offset estándar (-12)
                            var seasonalEp = (isPartTwo(curSlug) && effectiveEpisode > 12) ? (effectiveEpisode - 12) : effectiveEpisode;
                            pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + seasonalEp + "/");
                            if (absoluteEp !== seasonalEp) {
                                pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + absoluteEp + "/");
                            }
                        } else {
                            // Slug Raíz Continuo (One Piece):
                            // El episodio acumulado absoluto (1179) va de primero
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

                function tryPageUrls(pIdx) {
                    if (pIdx >= uniquePageUrls.length) return Promise.resolve([]);
                    var targetUrl = uniquePageUrls[pIdx];

                    return extractStreamsFromEpisodePage(targetUrl).then(function(streams) {
                        if (streams && streams.length > 0) return streams;
                        return tryPageUrls(pIdx + 1);
                    });
                }

                return tryPageUrls(0);
            });
        })
        .catch(function() {
            return [];
        });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
