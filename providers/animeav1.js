/**
 * Provider: AnimeAV1 (Anime en Sub Español y Doblaje Latino)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://animeav1.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// UTILIDADES Y DESEMPAQUETADOR
// ==========================================

function normalizeSearchQuery(text) {
    if (!text) return "";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
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

function isLatinOnly(str) {
    if (!str) return false;
    return /^[a-zA-Z0-9\s:!?,.'"\-_()]+$/.test(str);
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
    if (!m3u8Url || !m3u8Url.includes(".m3u8")) return Promise.resolve("1080p");
    return fetch(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function(res) { return res.ok ? res.text() : ""; })
        .then(function(text) {
            if (!text || !text.includes("#EXT-X-STREAM-INF")) {
                if (m3u8Url.includes("1080")) return "1080p";
                if (m3u8Url.includes("720")) return "720p";
                return "1080p";
            }
            var maxH = 0, resRegex = /RESOLUTION=\d+x(\d+)/gi, match;
            while ((match = resRegex.exec(text)) !== null) {
                var h = parseInt(match[1], 10);
                if (h > maxH) maxH = h;
            }
            if (maxH >= 1080) return "1080p";
            if (maxH >= 720) return "720p";
            if (maxH >= 480) return "480p";
            return "1080p";
        })
        .catch(function() { return "1080p"; });
}

function scoreSlugForSeason(slug, sNum) {
    var s = slug.toLowerCase();
    if (sNum === 1) {
        if (s.includes("-ii") || s.includes("-iii") || s.includes("-iv") || s.includes("-2") || s.includes("-3") || s.includes("-beyond") || s.includes("-part-2")) return -10;
        return 10;
    }
    var patterns = {
        2: ["-ii", "-2", "-2nd", "-beyond", "-season-2", "-2nd-season", "-s2"],
        3: ["-iii", "-3", "-3rd", "-part-2", "-part-ii", "-season-3", "-3rd-season", "-s3"],
        4: ["-iv", "-4", "-4th", "-final-season", "-season-4"],
        5: ["-v", "-5", "-5th", "-season-5"]
    }[sNum] || [`-${sNum}`];

    for (var i = 0; i < patterns.length; i++) {
        if (s.includes(patterns[i])) return 20 - i;
    }
    return 0;
}

// ==========================================
// PARSER DEL ÁRBOL DE SVELTEKIT
// ==========================================

function extractEmbedsFromSvelteKit(nodes) {
    var results = [];
    if (!Array.isArray(nodes)) return results;

    for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        if (!node || !Array.isArray(node.data)) continue;
        var dataArr = node.data;

        for (var i = 0; i < dataArr.length; i++) {
            var item = dataArr[i];
            if (item && typeof item === "object" && typeof item.embeds === "number") {
                var embedsObj = dataArr[item.embeds];
                if (embedsObj && typeof embedsObj === "object") {
                    // 1. Extraer SUB
                    if (typeof embedsObj.SUB === "number") {
                        var subList = dataArr[embedsObj.SUB];
                        if (Array.isArray(subList)) {
                            for (var j = 0; j < subList.length; j++) {
                                var srvItem = dataArr[subList[j]];
                                if (srvItem && typeof srvItem === "object") {
                                    var sName = dataArr[srvItem.server] || "HLS";
                                    var sUrl = dataArr[srvItem.url] || "";
                                    if (sUrl && typeof sUrl === "string" && sUrl.startsWith("http")) {
                                        results.push({ lang: "SUB", server: sName, url: sUrl });
                                    }
                                }
                            }
                        }
                    }
                    // 2. Extraer DUB (Latino)
                    if (typeof embedsObj.DUB === "number") {
                        var dubList = dataArr[embedsObj.DUB];
                        if (Array.isArray(dubList)) {
                            for (var k = 0; k < dubList.length; k++) {
                                var dItem = dataArr[dubList[k]];
                                if (dItem && typeof dItem === "object") {
                                    var dName = dataArr[dItem.server] || "HLS";
                                    var dUrl = dataArr[dItem.url] || "";
                                    if (dUrl && typeof dUrl === "string" && dUrl.startsWith("http")) {
                                        results.push({ lang: "LAT", server: dName, url: dUrl });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return results;
}

// ==========================================
// RESOLVERS DE STREAMING
// ==========================================

function resolveZillaHls(url) {
    var directM3u8 = url.replace("/play/", "/");
    return probeM3u8Quality(directM3u8, { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }).then(function(q) {
        return {
            url: directM3u8,
            quality: q || "1080p",
            headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }
        };
    }).catch(function() {
        return {
            url: directM3u8,
            quality: "1080p",
            headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }
        };
    });
}

function resolveMp4upload(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                           unpacked.match(/["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
            if (srcMatch) {
                return { url: srcMatch[1], quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
        }
        var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
        if (directMatch) {
            return { url: directMatch[0], quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(embed) {
    if (!embed || !embed.url) return Promise.resolve(null);
    var u = embed.url.toLowerCase();

    if (u.includes("zilla-networks") || embed.server === "HLS") {
        return resolveZillaHls(embed.url).then(function(res) {
            if (!res) return null;
            return {
                name: "AnimeAV1",
                title: `${res.quality || "1080p"} · ${embed.lang} · Zilla HLS`,
                quality: res.quality || "1080p",
                url: res.url,
                headers: res.headers || {}
            };
        });
    }

    if (u.includes("mp4upload")) {
        return resolveMp4upload(embed.url).then(function(res) {
            if (!res) return null;
            return {
                name: "AnimeAV1",
                title: `${res.quality || "720p"} · ${embed.lang} · MP4Upload`,
                quality: res.quality || "720p",
                url: res.url,
                headers: res.headers || {}
            };
        });
    }

    return Promise.resolve(null);
}

// ==========================================
// BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchAnimeAV1(queries) {
    var queryList = Array.isArray(queries) ? queries : [queries];

    function tryNextQuery(index) {
        if (index >= queryList.length) return Promise.resolve([]);
        var q = queryList[index];
        if (!q || !isLatinOnly(q)) return tryNextQuery(index + 1);

        console.log(`[AnimeAV1] Buscando: "${q}"`);

        return fetch(`${BASE_URL}/search`, {
            method: "POST",
            headers: {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Referer": `${BASE_URL}/`
            },
            body: JSON.stringify({ query: q })
        })
        .then(function(res) {
            if (!res.ok) return [];
            return res.json();
        })
        .then(function(json) {
            if (!Array.isArray(json) || json.length === 0) return tryNextQuery(index + 1);

            var slugs = [];
            for (var i = 0; i < json.length; i++) {
                var item = json[i];
                if (item && item.slug) {
                    slugs.push(item.slug);
                }
            }

            if (slugs.length > 0) {
                console.log(`[AnimeAV1] Slugs encontrados para "${q}": ${slugs.length}`);
                return slugs;
            }
            return tryNextQuery(index + 1);
        })
        .catch(function() {
            return tryNextQuery(index + 1);
        });
    }

    return tryNextQuery(0);
}

function extractStreamsFromEpisodeData(slug, episodeNum) {
    var dataUrl = `${BASE_URL}/media/${slug}/${episodeNum}/__data.json`;
    console.log(`[AnimeAV1] Consultando datos de episodio: ${dataUrl}`);

    return fetch(dataUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        })
        .then(function(json) {
            var embeds = extractEmbedsFromSvelteKit(json.nodes);
            if (embeds.length === 0) {
                return [];
            }

            console.log(`[AnimeAV1] Reproductores encontrados: ${embeds.length}`);

            var promises = embeds.map(function(emb) {
                return dispatchResolver(emb);
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
    console.log(`[AnimeAV1] Buscando TMDB ID ${tmdbId} (${mediaType})`);
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
            var isJapanese = (meta.original_language === "ja") ||
                             (meta.origin_country && meta.origin_country.indexOf("JP") !== -1) ||
                             (meta.production_countries && meta.production_countries.some(function(c) { return c.iso_3166_1 === "JP"; }));

            if (!isJapanese) {
                console.log("[AnimeAV1] Contenido no japonés. Abortando.");
                return [];
            }

            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;

            var rawQueries = [];

            // 1. Extraer palabras clave de títulos alternativos (priorizando Romaji)
            var altTitles = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altTitles.length; i++) {
                var alt = altTitles[i].title || "";
                if (isLatinOnly(alt)) {
                    var cleanAlt = normalizeSearchQuery(alt);
                    var wordsA = cleanAlt.split(/\s+/);
                    if (wordsA.length >= 2) rawQueries.push(wordsA.slice(0, 2).join(" "));
                    if (wordsA.length >= 3) rawQueries.push(wordsA.slice(0, 3).join(" "));
                    rawQueries.push(cleanAlt);
                }
            }

            if (origTitle && isLatinOnly(origTitle)) {
                var cleanO = normalizeSearchQuery(origTitle);
                var wordsO = cleanO.split(/\s+/);
                if (wordsO.length >= 2) rawQueries.push(wordsO.slice(0, 2).join(" "));
                rawQueries.push(cleanO);
            }

            if (title && isLatinOnly(title)) {
                var cleanT = normalizeSearchQuery(title);
                var wordsT = cleanT.split(/\s+/);
                if (wordsT.length >= 2) rawQueries.push(wordsT.slice(0, 2).join(" "));
                rawQueries.push(cleanT);
            }

            // Deduplicar búsquedas
            var searchQueries = rawQueries.filter(function(item, pos, self) {
                return item && item.length > 2 && self.indexOf(item) === pos;
            });

            return searchAnimeAV1(searchQueries).then(function(slugs) {
                if (slugs.length === 0) return [];

                // Ordenar según temporada (sNum === 2 prioriza -ii / -2)
                slugs.sort(function(a, b) {
                    return scoreSlugForSeason(b, sNum) - scoreSlugForSeason(a, sNum);
                });

                function tryNextSlug(index) {
                    if (index >= slugs.length) return Promise.resolve([]);
                    var s = slugs[index];

                    return extractStreamsFromEpisodeData(s, eNum).then(function(streams) {
                        if (streams && streams.length > 0) return streams;
                        return tryNextSlug(index + 1);
                    });
                }

                return tryNextSlug(0);
            });
        })
        .then(function(streams) {
            console.log(`[AnimeAV1] ✓ ${streams.length} streams extraídos`);
            return streams;
        })
        .catch(function(err) {
            console.log(`[AnimeAV1] Error general: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
