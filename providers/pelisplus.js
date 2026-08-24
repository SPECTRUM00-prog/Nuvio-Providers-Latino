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

var QUALITY_MAPS = {
    vimeos:     { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" },
    goodstream: { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" },
    vidhide:    { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" },
    streamwish: { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" }
};

var QUALITY_ORDER = ["x", "o", "h", "n", "l"];

function detectQualityFromUrl(url) {
    if (!url) return "1080p";
    var u = url.toLowerCase();
    
    var qMap = null;
    if (u.includes("goodstream")) qMap = QUALITY_MAPS.goodstream;
    else if (u.includes("vimeos")) qMap = QUALITY_MAPS.vimeos;
    else if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) qMap = QUALITY_MAPS.vidhide;
    else if (u.includes("streamwish") || u.includes("hlswish") || u.includes("turbovid")) qMap = QUALITY_MAPS.streamwish;
    
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
    if (/360p?/i.test(u)) return "360p";

    return "1080p";
}

function getServerLabel(url) {
    if (!url) return "Online";
    var u = url.toLowerCase();
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) return "VidHide";
    if (u.includes("turbovid") || u.includes("emturbovid")) return "Turbovid";
    if (u.includes("goodstream")) return "GoodStream";
    if (u.includes("vimeos")) return "Vimeos";
    if (u.includes("streamwish") || u.includes("hlswish")) return "StreamWish";
    return "PelisPlus";
}

// ==========================================
// RESOLVERS DE SERVIDORES
// ==========================================

function resolveVidHide(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
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
                    headers: { "User-Agent": USER_AGENT, "Referer": url }
                };
            }
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
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
            if (m3u8Match) {
                var streamUrl = m3u8Match[1];
                return {
                    url: streamUrl,
                    quality: detectQualityFromUrl(streamUrl),
                    headers: { "User-Agent": USER_AGENT, "Referer": url }
                };
            }
        }
        var directMatch = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
        if (directMatch) {
            return {
                url: directMatch[0],
                quality: detectQualityFromUrl(directMatch[0]),
                headers: { "User-Agent": USER_AGENT, "Referer": url }
            };
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    // Redirecciones directas de TioPlus
    if (u.includes("tioplus.app/")) {
        return fetch(url, { headers: DEFAULT_HEADERS, redirect: "follow" })
            .then(function(res) { return dispatchResolver(res.url); })
            .catch(function() { return null; });
    }

    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) {
        return resolveVidHide(url);
    }
    if (u.includes("turbovid") || u.includes("emturbovid") || u.includes("turbovidhls")) {
        return resolveTurbovid(url);
    }

    return Promise.resolve(null);
}

// ==========================================
// BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchPelisplus(query, isMovie) {
    var searchUrl = `${BASE_URL}/search/${encodeURIComponent(query)}`;
    console.log(`[PelisPlus] Buscando: "${query}"`);

    return fetch(searchUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) return [];
            return res.text();
        })
        .then(function(html) {
            var targetPrefix = isMovie ? "/pelicula/" : "/serie/";
            var regex = new RegExp(`href=["'](${targetPrefix}[^"']+)["']`, "gi");
            var matches = [];
            var match;

            while ((match = regex.exec(html)) !== null) {
                var path = match[1];
                var slug = path.replace(targetPrefix, "").replace(/\/$/, "");
                if (matches.indexOf(slug) === -1) {
                    matches.push(slug);
                }
            }

            console.log(`[PelisPlus] Slugs encontrados: ${matches.length}`);
            return matches;
        })
        .catch(function(err) {
            console.log(`[PelisPlus] Error en búsqueda: ${err.message}`);
            return [];
        });
}

function extractStreamsFromUrl(pageUrl) {
    console.log(`[PelisPlus] Consultando: ${pageUrl}`);
    return fetch(pageUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.text();
        })
        .then(function(html) {
            var embeds = [];

            // 1. Extraer iframes
            var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
            var ifMatch;
            while ((ifMatch = iframeRegex.exec(html)) !== null) {
                var src = ifMatch[1];
                if (src.startsWith("/")) src = BASE_URL + src;
                embeds.push(src);
            }

            // 2. Extraer atributos data-video / data-url
            var dataRegex = /data-(?:video|url|src)=["']([^"']+)["']/gi;
            var dtMatch;
            while ((dtMatch = dataRegex.exec(html)) !== null) {
                var dSrc = dtMatch[1];
                if (dSrc.startsWith("/")) dSrc = BASE_URL + dSrc;
                embeds.push(dSrc);
            }

            // 3. Extraer links puente de tioplus.app/ID
            var bridgeRegex = /https?:\/\/tioplus\.app\/[a-zA-Z0-9_-]{20,}/gi;
            var brMatch;
            while ((brMatch = bridgeRegex.exec(html)) !== null) {
                embeds.push(brMatch[0]);
            }

            // Deduplicar
            var uniqueEmbeds = embeds.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            if (uniqueEmbeds.length === 0) {
                return [];
            }

            console.log(`[PelisPlus] Reproductores encontrados: ${uniqueEmbeds.length}`);

            var promises = uniqueEmbeds.map(function(embedUrl) {
                var sName = getServerLabel(embedUrl);
                return dispatchResolver(embedUrl)
                    .then(function(res) {
                        if (!res || !res.url) return null;
                        var q = res.quality || "1080p";
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
        .catch(function() { return []; });
}

// ==========================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[PelisPlus] Buscando TMDB ID ${tmdbId} (${mediaType})`);
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
            var cleanT = normalizeText(title);
            var cleanOrig = normalizeText(origTitle);

            return searchPelisplus(title, isMovie).then(function(slugs) {
                var candidateSlugs = slugs.slice();
                if (candidateSlugs.indexOf(cleanT) === -1) candidateSlugs.push(cleanT);
                if (cleanOrig && candidateSlugs.indexOf(cleanOrig) === -1) candidateSlugs.push(cleanOrig);

                function tryNextSlug(index) {
                    if (index >= candidateSlugs.length) return Promise.resolve([]);
                    var s = candidateSlugs[index];

                    var pageUrl = isMovie
                        ? `${BASE_URL}/pelicula/${s}`
                        : `${BASE_URL}/episodio/${s}-${season}x${episode}`;

                    return extractStreamsFromUrl(pageUrl).then(function(streams) {
                        if (streams && streams.length > 0) return streams;

                        // Fallback alternativo para series
                        if (!isMovie) {
                            var altUrl = `${BASE_URL}/serie/${s}/temporada/${season}/episodio/${episode}`;
                            return extractStreamsFromUrl(altUrl).then(function(altStreams) {
                                if (altStreams && altStreams.length > 0) return altStreams;
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
            console.log(`[PelisPlus] ✓ ${streams.length} streams extraídos`);
            return streams;
        })
        .catch(function(err) {
            console.log(`[PelisPlus] Error general: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
