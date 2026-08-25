/**
 * Provider: PelisPlus / TioPlus (Películas y Series)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://tioplus.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// CRIPTOGRAFÍA PURA (HERMES ZERO-DEPENDENCIES)
// ==========================================

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

        if (words.length > 0) {
            var ratio = (matches / words.length) * 75;
            score = Math.max(score, ratio);
        }
    }

    if (year && cleanS.indexOf(String(year)) !== -1) {
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

function probeM3u8Quality(m3u8Url, headers) {
    if (!m3u8Url || !m3u8Url.includes(".m3u8")) {
        return Promise.resolve("720p");
    }

    return fetch(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    })
    .then(function(res) {
        if (!res.ok) return "720p";
        return res.text();
    })
    .then(function(text) {
        if (!text || !text.includes("#EXT-X-STREAM-INF")) {
            if (/1080p?/i.test(m3u8Url)) return "1080p";
            if (/720p?/i.test(m3u8Url)) return "720p";
            if (/480p?/i.test(m3u8Url)) return "480p";
            return "720p";
        }

        var maxH = 0;
        var resRegex = /RESOLUTION=\d+x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var h = parseInt(match[1], 10);
            if (h > maxH) maxH = h;
        }

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
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) return "VidHide";
    if (u.includes("turbovid") || u.includes("emturbovid") || u.includes("turboviplay") || u.includes("turbovidhls")) return "Turbovid";
    if (u.includes("goodstream")) return "GoodStream";
    if (u.includes("vimeos")) return "Vimeos";
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish")) return "StreamWish";
    return "Online";
}

// ==========================================
// RESOLVERS DE STREAMING
// ==========================================

function resolveVidHide(url) {
    var targetUrl = url;
    if (targetUrl.includes("callistanise.com/") && !targetUrl.includes("/v/") && !targetUrl.includes("/e/")) {
        targetUrl = targetUrl.replace("callistanise.com/", "callistanise.com/v/");
    } else if (targetUrl.includes("vidhideplus.com/") && !targetUrl.includes("/v/") && !targetUrl.includes("/e/")) {
        targetUrl = targetUrl.replace("vidhideplus.com/", "vidhideplus.com/v/");
    }

    var hostMatch = targetUrl.match(/^(https?:\/\/[^/]+)/i);
    var hostOrigin = hostMatch ? hostMatch[1] : "https://callistanise.com";

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
        redirect: "follow"
    })
    .then(function(res) {
        var finalHostMatch = (res.url || "").match(/^(https?:\/\/[^/]+)/i);
        if (finalHostMatch) hostOrigin = finalHostMatch[1];
        return res.text();
    })
    .then(function(html) {
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
            if (streamUrl.startsWith("/")) streamUrl = hostOrigin + streamUrl;
            var streamHeaders = { "User-Agent": USER_AGENT, "Referer": targetUrl };

            return probeM3u8Quality(streamUrl, streamHeaders).then(function(quality) {
                return {
                    url: streamUrl,
                    serverName: "VidHide",
                    quality: quality,
                    headers: streamHeaders
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveTurbovid(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
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
            var streamHeaders = { "User-Agent": USER_AGENT, "Referer": url };
            return probeM3u8Quality(streamUrl, streamHeaders).then(function(quality) {
                return {
                    url: streamUrl,
                    serverName: "Turbovid",
                    quality: quality,
                    headers: streamHeaders
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url) {
    var id = url.replace(/\/$/, "").split("/").pop();
    var targetUrl = "https://hlswish.com/e/" + id;

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
    })
    .then(function(res) { return res.text(); })
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

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) {
        return resolveVidHide(url);
    }
    if (u.includes("turbovid") || u.includes("emturbovid") || u.includes("turbovidhls") || u.includes("turboviplay")) {
        return resolveTurbovid(url);
    }
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish")) {
        return resolveStreamWish(url);
    }

    return Promise.resolve(null);
}

function resolvePlayerEndpoint(playerUrl) {
    return fetch(playerUrl, { headers: DEFAULT_HEADERS, redirect: "follow" })
        .then(function(res) {
            var targetUrl = res.url || "";

            if (targetUrl && !targetUrl.includes("tioplus.app/player/")) {
                return dispatchResolver(targetUrl);
            }

            return res.text().then(function(html) {
                var ifrMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (ifrMatch) {
                    var innerUrl = ifrMatch[1];
                    if (innerUrl.startsWith("/")) innerUrl = BASE_URL + innerUrl;
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
// BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchPelisplusSingle(query, isMovie) {
    var searchUrl = `${BASE_URL}/api/search/${encodeURIComponent(query)}`;

    return fetch(searchUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": `${BASE_URL}/search`
        }
    })
    .then(function(res) {
        if (!res.ok) return [];
        return res.text();
    })
    .then(function(html) {
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
    console.log(`[PelisPlus] Consultando página: ${pageUrl}`);
    return fetch(pageUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.text();
        })
        .then(function(html) {
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

            var uniqueTokens = tokens.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            if (uniqueTokens.length === 0) {
                return [];
            }

            console.log(`[PelisPlus] Opciones de servidor encontradas: ${uniqueTokens.length}`);

            var promises = uniqueTokens.map(function(tok) {
                var playerUrl = `${BASE_URL}/player/${pureBtoa(tok)}`;
                return resolvePlayerEndpoint(playerUrl)
                    .then(function(res) {
                        if (!res || !res.url) return null;
                        var sName = res.serverName || getServerLabel(res.url);
                        var q = res.quality || "720p";
                        return {
                            name: "PelisPlus",
                            title: `${q} · LAT · ${sName}`,
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
            return results.filter(function(st) { return st !== null; });
        })
        .catch(function() {
            return [];
        });
}

// ==========================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[PelisPlus] Buscando TMDB ID ${tmdbId} (${mediaType})`);
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = parseInt(episode, 10) || 1;
    var tmdbUrl = `https://api.themoviedb.org/3/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=alternative_titles`;

    return fetch(tmdbUrl)
        .then(function(res) {
            if (!res.ok) throw new Error("TMDB HTTP " + res.status);
            return res.json();
        })
        .then(function(meta) {
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = (meta.release_date || meta.first_air_date || "").substring(0, 4);

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

            for (var j = 0; j < uniqueTitles.length; j++) {
                var rawT = uniqueTitles[j];
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

                slugs.sort(function(a, b) {
                    return scoreCandidate(b, uniqueTitles, year) - scoreCandidate(a, uniqueTitles, year);
                });

                function tryNextSlug(index) {
                    if (index >= slugs.length) return Promise.resolve([]);
                    var slug = slugs[index];

                    var pageUrlsToTry = [];
                    if (isMovie) {
                        pageUrlsToTry.push(`${BASE_URL}/pelicula/${slug}`);
                    } else {
                        pageUrlsToTry.push(`${BASE_URL}/serie/${slug}/season/${sNum}/episode/${eNum}`);
                        pageUrlsToTry.push(`${BASE_URL}/episodio/${slug}-${sNum}x${eNum}`);
                        pageUrlsToTry.push(`${BASE_URL}/ver/${slug}-temporada-${sNum}-capitulo-${eNum}`);
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
        .then(function(streams) {
            console.log(`[PelisPlus] ✓ ${streams.length} streams extraídos`);
            return streams;
        })
        .catch(function(err) {
            console.log(`[PelisPlus] Error general: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
