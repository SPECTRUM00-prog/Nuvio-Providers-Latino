/**
 * Provider: JKAnime (Anime Series y Películas)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://jkanime.net";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// UTILIDADES Y DECODIFICACIÓN BASE64 PURA
// ==========================================

function pureAtob(input) {
    if (typeof atob === "function") {
        try { return atob(input); } catch (e) {}
    }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(input).replace(/=+$/, "");
    var output = "";
    if (str.length % 4 === 1) return "";
    for (var bc = 0, bs, buffer, idx = 0;
         (buffer = str.charAt(idx++));
         ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer),
         bc++ % 4) ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

function decodeBase64Safe(input) {
    if (!input) return "";
    var str = String(input).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4 !== 0) {
        str += "=";
    }
    if (typeof atob === "function") {
        try { return atob(str); } catch (e) {}
    }
    return pureAtob(str);
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

function cleanSlug(text) {
    return normalizeText(text);
}

function hasJapaneseChars(str) {
    return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(str);
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
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("strwish") || u.includes("sfasthwish") || u.includes("fasthwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) return "StreamWish";
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) return "VidHide";
    if (u.includes("filemoon")) return "Filemoon";
    if (u.includes("streamtape")) return "Streamtape";
    if (u.includes("mp4upload")) return "Mp4upload";
    if (u.includes("goodstream")) return "GoodStream";
    if (u.includes("vimeos")) return "Vimeos";
    return "JKAnime";
}

// ==========================================
// RESOLVERS DE STREAMING
// ==========================================

function resolveStreamWish(url) {
    var targetUrl = url;
    var idMatch = targetUrl.match(/\/(?:e|f|v|embed)\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
        targetUrl = "https://hlswish.com/e/" + idMatch[1];
    }

    console.log(`[JKAnime] Resolviendo StreamWish: ${targetUrl}`);

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                var streamUrl = m3u8Match[1];
                return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                    console.log(`[JKAnime] ✓ StreamWish (${q})`);
                    return {
                        url: streamUrl,
                        serverName: "StreamWish",
                        quality: q,
                        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
                    };
                });
            }
        }
        var directMatch = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
        if (directMatch) {
            return {
                url: directMatch[0],
                serverName: "StreamWish",
                quality: "720p",
                headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
            };
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveVidHide(url) {
    var targetUrl = url;
    var idMatch = targetUrl.match(/\/(?:e|f|v|embed)\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
        targetUrl = "https://vidhidepro.com/v/" + idMatch[1];
    }

    var hostMatch = targetUrl.match(/^(https?:\/\/[^/]+)/i);
    var hostOrigin = hostMatch ? hostMatch[1] : "https://vidhidepro.com";

    console.log(`[JKAnime] Resolviendo VidHide: ${targetUrl}`);

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
    .then(function(res) {
        var finalHost = (res.url || "").match(/^(https?:\/\/[^/]+)/i);
        if (finalHost) hostOrigin = finalHost[1];
        return res.text();
    })
    .then(function(html) {
        var streamUrl = null;
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) streamUrl = m3u8Match[1];
        }
        if (!streamUrl) {
            var directMatch = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
            if (directMatch) streamUrl = directMatch[0];
        }

        if (streamUrl) {
            if (streamUrl.startsWith("/")) streamUrl = hostOrigin + streamUrl;
            return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                console.log(`[JKAnime] ✓ VidHide (${q})`);
                return {
                    url: streamUrl,
                    serverName: "VidHide",
                    quality: q,
                    headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveMp4upload(url) {
    var targetUrl = url;
    if (!targetUrl.includes("/embed-")) {
        var idMatch = targetUrl.match(/\.com\/(?:embed-)?([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://www.mp4upload.com/embed-" + idMatch[1] + ".html";
    }

    console.log(`[JKAnime] Resolviendo Mp4upload: ${targetUrl}`);

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4[^"']*)["']/i) ||
                           unpacked.match(/["'](https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*)["']/i);
            if (srcMatch) {
                console.log(`[JKAnime] ✓ Mp4upload (720p)`);
                return {
                    url: srcMatch[1],
                    serverName: "Mp4upload",
                    quality: "720p",
                    headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
                };
            }
        }
        var directMatch = html.match(/["'](https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*)["']/i);
        if (directMatch) {
            return {
                url: directMatch[1],
                serverName: "Mp4upload",
                quality: "720p",
                headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
            };
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");

    console.log(`[JKAnime] Resolviendo Streamtape: ${targetUrl}`);

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var regex = /document\.getElementById\(['"](?:robotlink|ideoolink|noroot)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:\(['"]([^'"]+)['"]\)\.substring\((\d+)\)|['"]([^'"]+)['"])/i;
        var match = html.match(regex);

        if (match) {
            var part1 = match[1];
            var part2 = "";
            if (match[2] && match[3]) part2 = match[2].substring(parseInt(match[3]));
            else if (match[4]) part2 = match[4];

            var sUrl = "https:" + part1 + part2;
            console.log(`[JKAnime] ✓ Streamtape (720p)`);
            return {
                url: sUrl,
                serverName: "Streamtape",
                quality: "720p",
                headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
            };
        }

        var tokenMatch = html.match(/['"](\/\/streamtape\.com\/get_video\?[^'"]+)['"]/i) ||
                         html.match(/['"](\/\/[^'"]*tapecontent\.net\/get_video\?[^'"]+)['"]/i);
        if (tokenMatch) {
            return {
                url: "https:" + tokenMatch[1],
                serverName: "Streamtape",
                quality: "720p",
                headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
            };
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("strwish") || u.includes("sfasthwish") || u.includes("fasthwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) {
        return resolveStreamWish(url);
    }
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) {
        return resolveVidHide(url);
    }
    if (u.includes("mp4upload")) {
        return resolveMp4upload(url);
    }
    if (u.includes("streamtape")) {
        return resolveStreamtape(url);
    }

    return Promise.resolve(null);
}

// ==========================================
// BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchJkanime(queries) {
    var queryList = Array.isArray(queries) ? queries : [queries];
    
    function tryNextQuery(index) {
        if (index >= queryList.length) return Promise.resolve([]);
        var q = queryList[index];
        if (!q || hasJapaneseChars(q)) return tryNextQuery(index + 1);

        var searchUrl = `${BASE_URL}/buscar/${encodeURIComponent(q)}/`;
        console.log(`[JKAnime] Buscando: "${q}"`);

        return fetch(searchUrl, { headers: DEFAULT_HEADERS })
            .then(function(res) {
                if (!res.ok) return [];
                return res.text();
            })
            .then(function(html) {
                var regex = /href=["']https?:\/\/jkanime\.net\/([^"'/]+)\/["']/gi;
                var matches = [];
                var match;

                while ((match = regex.exec(html)) !== null) {
                    var slug = match[1];
                    if (slug && slug !== "buscar" && slug !== "horario" && slug !== "top" && slug !== "directorio" && matches.indexOf(slug) === -1) {
                        matches.push(slug);
                    }
                }

                if (matches.length > 0) {
                    console.log(`[JKAnime] Slugs encontrados para "${q}": ${matches.length}`);
                    return matches;
                }
                return tryNextQuery(index + 1);
            })
            .catch(function() {
                return tryNextQuery(index + 1);
            });
    }

    return tryNextQuery(0);
}

function extractStreamsFromEpisodePage(pageUrl) {
    console.log(`[JKAnime] Consultando episodio: ${pageUrl}`);

    return fetch(pageUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.text();
        })
        .then(function(html) {
            var rawEmbeds = [];

            // 1. Extraer todos los tokens ?u=BASE64 del HTML completo
            var uRegex = /[?&]u=([a-zA-Z0-9+/=_-]+)/gi;
            var uMatch;
            while ((uMatch = uRegex.exec(html)) !== null) {
                var decoded = decodeBase64Safe(uMatch[1]);
                if (decoded && decoded.startsWith("http")) {
                    rawEmbeds.push(decoded);
                }
            }

            // 2. Extraer enlaces directos de scripts o iframes
            var directRegex = /["'](https?:\/\/(?:sfasthwish|streamwish|vidhide|mp4upload|streamtape)[^"'\s\\]+)["']/gi;
            var dMatch;
            while ((dMatch = directRegex.exec(html)) !== null) {
                rawEmbeds.push(dMatch[1]);
            }

            // Deduplicar URLs
            var uniqueEmbeds = rawEmbeds.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            if (uniqueEmbeds.length === 0) {
                console.log("[JKAnime] No se encontraron reproductores en el episodio");
                return [];
            }

            console.log(`[JKAnime] Servidores encontrados: ${uniqueEmbeds.length}`);

            var promises = uniqueEmbeds.map(function(embedUrl) {
                return dispatchResolver(embedUrl)
                    .then(function(res) {
                        if (!res || !res.url) return null;
                        var sName = res.serverName || getServerLabel(res.url);
                        var q = res.quality || "720p";
                        return {
                            name: "JKAnime",
                            title: `${q} · SUB · ${sName}`,
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
        .catch(function(err) {
            console.log(`[JKAnime] Error extrayendo capítulo: ${err.message}`);
            return [];
        });
}

// ==========================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[JKAnime] Buscando TMDB ID ${tmdbId} (${mediaType})`);
    var isMovie = mediaType === "movie";
    var epNum = episode || 1;
    var tmdbUrl = `https://api.themoviedb.org/3/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`;

    return fetch(tmdbUrl)
        .then(function(res) {
            if (!res.ok) throw new Error("TMDB HTTP " + res.status);
            return res.json();
        })
        .then(function(meta) {
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;

            // Construir lista de búsqueda con ambos nombres y palabras clave
            var searchQueries = [];
            if (title && !hasJapaneseChars(title)) {
                searchQueries.push(title);
                var wordsT = title.split(/\s+/);
                if (wordsT.length > 3) searchQueries.push(wordsT.slice(0, 3).join(" "));
            }
            if (origTitle && origTitle !== title && !hasJapaneseChars(origTitle)) {
                searchQueries.push(origTitle);
                var wordsO = origTitle.split(/\s+/);
                if (wordsO.length > 3) searchQueries.push(wordsO.slice(0, 3).join(" "));
            }

            var cleanT = cleanSlug(title);
            var cleanOrig = hasJapaneseChars(origTitle) ? "" : cleanSlug(origTitle);

            return searchJkanime(searchQueries).then(function(slugs) {
                var candidateSlugs = slugs.slice();
                if (cleanT && candidateSlugs.indexOf(cleanT) === -1) candidateSlugs.push(cleanT);
                if (cleanOrig && candidateSlugs.indexOf(cleanOrig) === -1) candidateSlugs.push(cleanOrig);

                function tryNextSlug(index) {
                    if (index >= candidateSlugs.length) return Promise.resolve([]);
                    var s = candidateSlugs[index];

                    var pageUrl = isMovie
                        ? `${BASE_URL}/${s}/pelicula/`
                        : `${BASE_URL}/${s}/${epNum}/`;

                    return extractStreamsFromEpisodePage(pageUrl).then(function(streams) {
                        if (streams && streams.length > 0) return streams;

                        if (isMovie) {
                            var altMovieUrl = `${BASE_URL}/${s}/1/`;
                            return extractStreamsFromEpisodePage(altMovieUrl).then(function(mStreams) {
                                if (mStreams && mStreams.length > 0) return mStreams;
                                return tryNextSlug(index + 1);
                            });
                        }

                        return tryNextSlug(index + 1);
                    });
                }

                return tryNextSlug(0);
            });
        })
        .then(function(streams) {
            console.log(`[JKAnime] ✓ ${streams.length} streams extraídos`);
            return streams;
        })
        .catch(function(err) {
            console.log(`[JKAnime] Error general: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
