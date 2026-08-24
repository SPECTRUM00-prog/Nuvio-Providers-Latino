/**
 * Provider: ZonaLeRoS (Películas y Series)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://www.zona-leros.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// UTILIDADES DE TEXTO
// ==========================================

function normalizeText(text) {
    if (!text) return "";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanSlug(text) {
    return normalizeText(text).replace(/\s+/g, "-").replace(/-+/g, "-");
}

// ==========================================
// RESOLVERS (STREAMTAPE & SERVIDORES)
// ==========================================

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");

    return fetch(targetUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": targetUrl
        },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var regex = /document\.getElementById\(['"](?:robotlink|ideoolink|noroot)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:\(['"]([^'"]+)['"]\)\.substring\((\d+)\)|['"]([^'"]+)['"])/i;
        var match = html.match(regex);

        if (match) {
            var part1 = match[1];
            var part2 = "";
            if (match[2] && match[3]) {
                part2 = match[2].substring(parseInt(match[3]));
            } else if (match[4]) {
                part2 = match[4];
            }
            var streamUrl = "https:" + part1 + part2;
            return {
                url: streamUrl,
                quality: "1080p",
                headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
            };
        }

        var tokenMatch = html.match(/['"](\/\/streamtape\.com\/get_video\?[^'"]+)['"]/i) ||
                         html.match(/['"](\/\/[^'"]*tapecontent\.net\/get_video\?[^'"]+)['"]/i);
        if (tokenMatch) {
            return {
                url: "https:" + tokenMatch[1],
                quality: "1080p",
                headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
            };
        }

        return null;
    })
    .catch(function() { return null; });
}

function resolveAnomizadorUrl(anomizadorUrl) {
    return fetch(anomizadorUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": `${BASE_URL}/`
        },
        redirect: "follow"
    })
    .then(function(res) {
        var finalUrl = res.url || "";
        var u = finalUrl.toLowerCase();

        if (u.includes("streamtape")) {
            return resolveStreamtape(finalUrl).then(function(resSt) {
                if (!resSt) return null;
                return {
                    name: "ZonaLeRoS",
                    title: "1080p · DUAL · Streamtape",
                    quality: resSt.quality || "1080p",
                    url: resSt.url,
                    headers: resSt.headers || {}
                };
            });
        }

        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchCatalog(query, isMovie) {
    if (!query) return Promise.resolve(null);
    var searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
    console.log(`[ZonaLeRoS] Buscando en API: "${query}"`);

    return fetch(searchUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) return [];
            return res.json();
        })
        .then(function(items) {
            if (!Array.isArray(items) || items.length === 0) {
                console.log(`[ZonaLeRoS] 0 resultados para "${query}"`);
                return null;
            }

            console.log(`[ZonaLeRoS] ${items.length} resultados devueltos por la API`);
            var targetType = isMovie ? "pelicula" : "series";
            var normalizedQ = normalizeText(query);

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var notab = item.notable || {};
                var tipo = (notab.tipo || item.notable_type || "").toLowerCase();
                var title = normalizeText(notab.title || item.title || "");

                if (tipo.includes(targetType) || tipo.includes(isMovie ? "movie" : "serie")) {
                    if (title === normalizedQ || title.includes(normalizedQ) || normalizedQ.includes(title)) {
                        console.log(`[ZonaLeRoS] Coincidencia encontrada: ${notab.url || item.url}`);
                        return notab.url || item.url || null;
                    }
                }
            }

            // Primer resultado con slug válido
            var first = items[0].notable ? items[0].notable.url : (items[0].url || null);
            if (first) {
                console.log(`[ZonaLeRoS] Usando primer resultado: ${first}`);
                return first;
            }

            return null;
        })
        .catch(function(err) {
            console.log(`[ZonaLeRoS] Error en search API: ${err.message}`);
            return null;
        });
}

function extractFromPage(pageUrl) {
    console.log(`[ZonaLeRoS] Consultando página: ${pageUrl}`);
    return fetch(pageUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": `${BASE_URL}/`
        }
    })
    .then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
    })
    .then(function(html) {
        var anomizadorMatches = html.match(/https?:\/\/anomizador\.zona-leros\.com\/\?hs=[^"'\s<>]+/gi) || [];

        var uniqueUrls = [];
        for (var i = 0; i < anomizadorMatches.length; i++) {
            var u = anomizadorMatches[i].replace(/&amp;/g, "&");
            if (uniqueUrls.indexOf(u) === -1) {
                uniqueUrls.push(u);
            }
        }

        if (uniqueUrls.length === 0) {
            console.log("[ZonaLeRoS] No se encontraron reproductores en la página");
            return [];
        }

        console.log(`[ZonaLeRoS] Opciones encontradas: ${uniqueUrls.length}`);

        var resolvePromises = uniqueUrls.map(function(optUrl) {
            return resolveAnomizadorUrl(optUrl);
        });

        return Promise.all(resolvePromises);
    })
    .then(function(results) {
        return results.filter(function(st) { return st !== null; });
    })
    .catch(function(err) {
        console.log(`[ZonaLeRoS] Error extrayendo de página: ${err.message}`);
        return [];
    });
}

// ==========================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[ZonaLeRoS] Buscando TMDB ID ${tmdbId} (${mediaType})`);
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

            console.log(`[ZonaLeRoS] Metadatos TMDB: "${title}" / "${origTitle}"`);

            // Probar búsqueda por título en español y luego en inglés
            return searchCatalog(title, isMovie).then(function(slug) {
                if (slug) return slug;
                if (origTitle && origTitle !== title) {
                    return searchCatalog(origTitle, isMovie);
                }
                return null;
            }).then(function(slugFound) {
                // Si la API encontró el slug, lo usamos; si no, creamos los slugs candidatos
                var candidateSlugs = [];
                if (slugFound) candidateSlugs.push(slugFound);
                candidateSlugs.push(cleanSlug(title));
                if (origTitle) candidateSlugs.push(cleanSlug(origTitle));

                // Deduplicar slugs candidatos
                candidateSlugs = candidateSlugs.filter(function(item, pos, self) {
                    return item && self.indexOf(item) === pos;
                });

                function tryNextSlug(index) {
                    if (index >= candidateSlugs.length) {
                        return Promise.resolve([]);
                    }
                    var s = candidateSlugs[index];
                    var pageUrl = isMovie
                        ? `${BASE_URL}/pelicula/${s}`
                        : `${BASE_URL}/series/episode/${s}-${season}-${episode}`;

                    return extractFromPage(pageUrl).then(function(streams) {
                        if (streams && streams.length > 0) return streams;
                        return tryNextSlug(index + 1);
                    });
                }

                return tryNextSlug(0);
            });
        })
        .then(function(streams) {
            console.log(`[ZonaLeRoS] ✓ ${streams.length} streams extraídos`);
            return streams;
        })
        .catch(function(err) {
            console.log(`[ZonaLeRoS] Error general: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
