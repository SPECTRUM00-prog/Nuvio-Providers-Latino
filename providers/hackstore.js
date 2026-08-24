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
// UTILIDADES Y DESEMPAQUETADOR
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

function detectQualityFromUrl(url) {
    if (!url) return "Unknown";
    var match = url.match(/[_\-\/](\d{3,4})p/i);
    if (match) return match[1] + "p";
    if (url.includes("1080")) return "1080p";
    if (url.includes("720")) return "720p";
    if (url.includes("480")) return "480p";
    if (url.includes("360")) return "360p";
    return "1080p";
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
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                var streamUrl = m3u8Match[1];
                return {
                    url: streamUrl,
                    quality: detectQualityFromUrl(streamUrl),
                    headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
                };
            }
        }
        var directMatch = html.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
        if (directMatch) {
            return {
                url: directMatch[1],
                quality: detectQualityFromUrl(directMatch[1]),
                headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
            };
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
        var fileMatch = html.match(/file:\s*"([^"]+)"/i);
        if (fileMatch) {
            var streamUrl = fileMatch[1];
            return {
                url: streamUrl,
                quality: detectQualityFromUrl(streamUrl),
                headers: { "User-Agent": USER_AGENT, "Referer": url, "Origin": "https://goodstream.one" }
            };
        }
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8 = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8) {
                return {
                    url: m3u8[1],
                    quality: detectQualityFromUrl(m3u8[1]),
                    headers: { "User-Agent": USER_AGENT, "Referer": url, "Origin": "https://goodstream.one" }
                };
            }
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
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1],
                    quality: detectQualityFromUrl(m3u8Match[1]),
                    headers: { "User-Agent": USER_AGENT, "Referer": "https://hlswish.com/" }
                };
            }
        }
        var directMatch = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
        if (directMatch) {
            return {
                url: directMatch[0],
                quality: detectQualityFromUrl(directMatch[0]),
                headers: { "User-Agent": USER_AGENT, "Referer": "https://hlswish.com/" }
            };
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
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1],
                    quality: detectQualityFromUrl(m3u8Match[1]),
                    headers: { "User-Agent": USER_AGENT, "Referer": url }
                };
            }
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
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[1],
                    quality: detectQualityFromUrl(m3u8Match[1]),
                    headers: { "User-Agent": USER_AGENT, "Referer": url }
                };
            }
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

    // VOE y Doodstream retornan seguro null
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
    var tmdbUrl = `https://api.themoviedb.org/3/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX`;

    return fetch(tmdbUrl)
        .then(function(res) {
            if (!res.ok) throw new Error("TMDB HTTP " + res.status);
            return res.json();
        })
        .then(function(meta) {
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = (isMovie ? meta.release_date : meta.first_air_date || "").slice(0, 4);

            var slugClean = normalizeText(title);
            var origSlugClean = normalizeText(origTitle);

            var candidateSlugs = [];

            if (isMovie) {
                // Variantes de slugs para películas
                candidateSlugs.push(slugClean);
                if (year) candidateSlugs.push(`${slugClean}-${year}`);
                if (origSlugClean && origSlugClean !== slugClean) {
                    candidateSlugs.push(origSlugClean);
                    if (year) candidateSlugs.push(`${origSlugClean}-${year}`);
                }
                return getPostId(candidateSlugs, "movies");
            } else {
                // Variantes de slugs para episodios
                candidateSlugs.push(`${slugClean}-temporada-${season}-episodio-${episode}`);
                candidateSlugs.push(`${slugClean}-temporada-${season}-capitulo-${episode}`);
                candidateSlugs.push(`${slugClean}-${season}x${episode}`);
                if (origSlugClean && origSlugClean !== slugClean) {
                    candidateSlugs.push(`${origSlugClean}-temporada-${season}-episodio-${episode}`);
                }
                return getPostId(candidateSlugs, "episodes");
            }
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

            // Resolución concurrente con Promise.all
            var promises = embeds.map(function(embed) {
                var url = embed.url || embed.link || "";
                var lang = embed.lang || embed.language || "LAT";
                var serverName = getServerLabel(url);

                return dispatchResolver(url)
                    .then(function(result) {
                        if (!result || !result.url) return null;
                        var qual = result.quality || "1080p";
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
