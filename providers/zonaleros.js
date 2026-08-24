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
    return normalizeText(text).replace(/\s+/g, "-");
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
        // Patrón estándar de Streamtape: document.getElementById('robotlink').innerHTML = '...' + '...';
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

        // Patrón fallback: extracción directa de token de stream
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

        // VOE, Doodstream y Byse (retorno seguro)
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// FLUJO DE BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchCatalog(query, isMovie) {
    var searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
    return fetch(searchUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) return [];
            return res.json();
        })
        .then(function(items) {
            if (!Array.isArray(items) || items.length === 0) return null;

            var targetType = isMovie ? "pelicula" : "series";
            var normalizedQ = normalizeText(query);

            // 1. Coincidencia exacta de tipo y nombre
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var notab = item.notable || {};
                var tipo = (notab.tipo || "").toLowerCase();
                var title = normalizeText(notab.title || item.title || "");

                if (tipo.includes(targetType) && (title === normalizedQ || title.includes(normalizedQ))) {
                    return notab.url || null;
                }
            }

            // 2. Primer resultado con URL válida
            if (items[0] && items[0].notable && items[0].notable.url) {
                return items[0].notable.url;
            }

            return null;
        })
        .catch(function() { return null; });
}

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

            return searchCatalog(title, isMovie).then(function(slug) {
                if (slug) return { slug: slug, isMovie: isMovie };
                if (origTitle && origTitle !== title) {
                    return searchCatalog(origTitle, isMovie).then(function(origSlug) {
                        return { slug: origSlug, isMovie: isMovie };
                    });
                }
                return { slug: null, isMovie: isMovie };
            });
        })
        .then(function(data) {
            if (!data.slug) {
                console.log("[ZonaLeRoS] No se encontró el contenido en ZonaLeRoS");
                return [];
            }

            var pageUrl = isMovie
                ? `${BASE_URL}/pelicula/${data.slug}`
                : `${BASE_URL}/series/episode/${data.slug}-${season}-${episode}`;

            console.log(`[ZonaLeRoS] Obteniendo página: ${pageUrl}`);

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
                // Extraer todos los links del anomizador en el HTML
                var anomizadorMatches = html.match(/https?:\/\/anomizador\.zona-leros\.com\/\?hs=[^"'\s<>]+/gi) || [];

                // Deduplicar URLs
                var uniqueUrls = [];
                for (var i = 0; i < anomizadorMatches.length; i++) {
                    var u = anomizadorMatches[i].replace(/&amp;/g, "&");
                    if (uniqueUrls.indexOf(u) === -1) {
                        uniqueUrls.push(u);
                    }
                }

                if (uniqueUrls.length === 0) {
                    console.log("[ZonaLeRoS] No se encontraron enlaces de reproducción");
                    return [];
                }

                console.log(`[ZonaLeRoS] Opciones de servidor encontradas: ${uniqueUrls.length}`);

                // Resolución concurrente con Promise.all
                var resolvePromises = uniqueUrls.map(function(optUrl) {
                    return resolveAnomizadorUrl(optUrl);
                });

                return Promise.all(resolvePromises);
            })
            .then(function(results) {
                var validStreams = results.filter(function(st) { return st !== null; });
                console.log(`[ZonaLeRoS] ✓ ${validStreams.length} streams válidos extraídos`);
                return validStreams;
            });
        })
        .catch(function(err) {
            console.log(`[ZonaLeRoS] Error: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
