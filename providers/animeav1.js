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

function cleanSlug(text) {
    return normalizeText(text);
}

function hasJapaneseChars(str) {
    if (!str) return false;
    return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(str);
}

function isSlugSimilar(query, slug) {
    if (!query || !slug) return false;
    var cleanQ = normalizeText(query).replace(/-/g, " ");
    var cleanS = normalizeText(slug).replace(/-/g, " ");
    var qWords = cleanQ.split(/\s+/).filter(function(w) { return w.length > 2; });
    if (qWords.length === 0) return cleanS.includes(cleanQ);
    for (var i = 0; i < qWords.length; i++) {
        if (cleanS.includes(qWords[i])) return true;
    }
    return false;
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

function getSeasonSlugVariants(baseSlug, sNum) {
    if (sNum === 1) return [baseSlug];
    var suffixes = [
        `-${sNum}`,
        `-season-${sNum}`,
        `-s${sNum}`,
        sNum === 2 ? "-2nd-season" : (sNum === 3 ? "-3rd-season" : `-${sNum}th-season`),
        sNum === 2 ? "-ii" : (sNum === 3 ? "-iii" : (sNum === 4 ? "-iv" : `-${sNum}`)),
        sNum === 2 ? "-part-2" : (sNum === 3 ? "-part-3" : `-${sNum}`)
    ];
    return suffixes.map(function(suf) { return baseSlug + suf; });
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
                    
                    var langKeys = Object.keys(embedsObj);
                    for (var l = 0; l < langKeys.length; l++) {
                        var lKey = langKeys[l];
                        var langLabel = (lKey === "DUB" || lKey === "LAT") ? "LAT" : "SUB";
                        var listIdx = embedsObj[lKey];

                        if (typeof listIdx === "number") {
                            var srvList = dataArr[listIdx];
                            if (Array.isArray(srvList)) {
                                for (var j = 0; j < srvList.length; j++) {
                                    var srvItem = dataArr[srvList[j]];
                                    if (srvItem && typeof srvItem === "object") {
                                        var sName = dataArr[srvItem.server] || "HLS";
                                        var sUrl = dataArr[srvItem.url] || "";
                                        if (sUrl && typeof sUrl === "string" && sUrl.startsWith("http")) {
                                            results.push({ lang: langLabel, server: sName, url: sUrl });
                                        }
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
    var idMatch = url.match(/\/play\/([a-fA-F0-9]{32})/i) || url.match(/\/([a-fA-F0-9]{32})/i);
    var id = idMatch ? idMatch[1] : null;
    var directM3u8 = id ? `https://player.zilla-networks.com/m3u8/${id}` : url.replace("/play/", "/m3u8/");

    var requestHeaders = {
        "User-Agent": USER_AGENT,
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL
    };

    return probeM3u8Quality(directM3u8, requestHeaders).then(function(q) {
        return {
            url: directM3u8,
            quality: q || "1080p",
            headers: requestHeaders
        };
    }).catch(function() {
        return {
            url: directM3u8,
            quality: "1080p",
            headers: requestHeaders
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
        // Detección precisa de calidad FHD (1080p) vs HD (720p)
        var quality = "1080p";
        if (html.includes("FHD") || html.includes("1080")) {
            quality = "1080p";
        } else if (html.includes("HD") || html.includes("720")) {
            quality = "720p";
        } else if (html.includes("SD") || html.includes("480")) {
            quality = "480p";
        }

        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                           unpacked.match(/["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
            if (srcMatch) {
                return { url: srcMatch[1], quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
        }
        var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
        if (directMatch) {
            return { url: directMatch[0], quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": url } };
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` } })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
            if (packMatch) {
                var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
                var m3uMatch = unpacked.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
                if (m3uMatch) {
                    return probeM3u8Quality(m3uMatch[0]).then(function(q) {
                        return { url: m3uMatch[0], quality: q || "1080p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                    });
                }
            }
            var directM3u = html.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
            if (directM3u) {
                return probeM3u8Quality(directM3u[0]).then(function(q) {
                    return { url: directM3u[0], quality: q || "1080p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
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
                title: `${res.quality || "1080p"} · ${embed.lang} · MP4Upload`,
                quality: res.quality || "1080p",
                url: res.url,
                headers: res.headers || {}
            };
        });
    }

    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish") || u.includes("sfasthwish")) {
        return resolveStreamWish(embed.url).then(function(res) {
            if (!res) return null;
            return {
                name: "AnimeAV1",
                title: `${res.quality || "1080p"} · ${embed.lang} · StreamWish`,
                quality: res.quality || "1080p",
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
        if (!q || hasJapaneseChars(q)) return tryNextQuery(index + 1);

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
                    if (isSlugSimilar(q, item.slug) || isSlugSimilar(item.title, item.slug)) {
                        slugs.push(item.slug);
                    }
                }
            }

            if (slugs.length > 0) return slugs;
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
                console.log("[AnimeAV1] No se encontraron reproductores en el episodio");
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
        .catch(function(err) {
            console.log(`[AnimeAV1] Error extrayendo capítulo: ${err.message}`);
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
    var eNum = isMovie ? 1 : (parseInt(episode, 10) || 1);
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

            var searchQueries = [];
            var directSlugs = [];

            // 1. Título principal
            if (title && !hasJapaneseChars(title)) {
                searchQueries.push(title);
                var wordsT = title.split(/\s+/);
                if (wordsT.length > 2) searchQueries.push(wordsT.slice(0, 2).join(" "));
                
                var baseSlugT = cleanSlug(title);
                if (baseSlugT) {
                    directSlugs = directSlugs.concat(getSeasonSlugVariants(baseSlugT, sNum));
                }
            }

            // 2. Títulos alternativos (Romaji / Inglés)
            var altTitles = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altTitles.length; i++) {
                var alt = altTitles[i].title || "";
                if (alt && !hasJapaneseChars(alt)) {
                    searchQueries.push(alt);
                    var wordsA = alt.split(/\s+/);
                    if (wordsA.length > 2) searchQueries.push(wordsA.slice(0, 2).join(" "));
                    
                    var baseSlugAlt = cleanSlug(alt);
                    if (baseSlugAlt) {
                        directSlugs = directSlugs.concat(getSeasonSlugVariants(baseSlugAlt, sNum));
                    }
                }
            }

            // 3. Título Original
            if (origTitle && origTitle !== title && !hasJapaneseChars(origTitle)) {
                searchQueries.push(origTitle);
                var baseSlugO = cleanSlug(origTitle);
                if (baseSlugO) {
                    directSlugs = directSlugs.concat(getSeasonSlugVariants(baseSlugO, sNum));
                }
            }

            searchQueries = searchQueries.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            return searchAnimeAV1(searchQueries).then(function(slugs) {
                var candidateSlugs = slugs.slice();

                for (var s = 0; s < directSlugs.length; s++) {
                    var dSlug = directSlugs[s];
                    if (dSlug && candidateSlugs.indexOf(dSlug) === -1) {
                        candidateSlugs.push(dSlug);
                    }
                }

                if (candidateSlugs.length === 0) return [];

                function tryNextSlug(index) {
                    if (index >= candidateSlugs.length) return Promise.resolve([]);
                    var slugToTry = candidateSlugs[index];

                    return extractStreamsFromEpisodeData(slugToTry, eNum).then(function(streams) {
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
