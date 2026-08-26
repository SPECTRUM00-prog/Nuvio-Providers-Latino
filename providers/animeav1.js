/**
 * Provider: AnimeAV1 (Anime en Sub Español y Doblaje Latino)
 * Motor: AniList GraphQL Engine + Algoritmo Universal de Temporadas y SvelteKit Tree Parser
 * Arquitectura: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://animeav1.com";
const ANILIST_URL = "https://graphql.anilist.co";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// 1. ALGORITMOS MATEMÁTICOS Y NORMALIZACIÓN
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

function toRoman(num) {
    var val = [100, 90, 50, 40, 10, 9, 5, 4, 1];
    var syms = ["c", "xc", "l", "xl", "x", "ix", "v", "iv", "i"];
    var roman = "";
    var n = parseInt(num, 10) || 1;
    for (var i = 0; i < val.length; i++) {
        while (n >= val[i]) {
            roman += syms[i];
            n -= val[i];
        }
    }
    return roman || "i";
}

function toOrdinal(num) {
    var n = parseInt(num, 10) || 1;
    var s = ["th", "st", "nd", "rd"];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getUniversalSeasonVariants(baseSlug, sNum, isMovie) {
    if (!baseSlug) return [];
    if (isMovie) {
        return [
            baseSlug,
            baseSlug + "-movie",
            baseSlug + "-the-movie",
            baseSlug + "-la-pelicula",
            baseSlug + "-pelicula"
        ];
    }

    var num = parseInt(sNum, 10) || 1;
    var roman = toRoman(num);
    var ordinal = toOrdinal(num);

    var list = [];
    if (num === 1) {
        list.push(baseSlug + "-s1");
        list.push(baseSlug);
        list.push(baseSlug + "-season-1");
        list.push(baseSlug + "-1st-season");
    } else {
        list.push(baseSlug + "-s" + num);
        list.push(baseSlug + "-" + num);
        list.push(baseSlug + "-" + ordinal + "-season");
        list.push(baseSlug + "-season-" + num);
        list.push(baseSlug + "-" + roman);
        list.push(baseSlug + "-part-" + num);
        list.push(baseSlug + "-part-" + roman);
        list.push(baseSlug + "-beyond");
    }
    return list;
}

function scoreSlugForSeason(slug, sNum, isMovie) {
    var s = slug.toLowerCase();
    if (isMovie) {
        if (s.includes("movie") || s.includes("pelicula")) return 20;
        return 5;
    }

    var num = parseInt(sNum, 10) || 1;
    var roman = toRoman(num);
    var ordinal = toOrdinal(num);

    if (num === 1) {
        if (s.includes("-s1") || s.includes("-season-1") || s.includes("-1st-season")) return 30;
        // Penalizar temporadas superiores
        if (s.includes("-s2") || s.includes("-s3") || s.includes("-s4") || s.includes("-2nd") || s.includes("-3rd") || s.includes("-ii") || s.includes("-iii") || s.includes("-iv") || s.includes("-part-2")) {
            return -25;
        }
        return 15;
    }

    // Temporadas superiores (sNum >= 2)
    var targetTokens = [
        "-s" + num,
        "-" + ordinal + "-season",
        "-season-" + num,
        "-" + roman,
        "-part-" + num,
        "-part-" + roman
    ];

    for (var i = 0; i < targetTokens.length; i++) {
        if (s.includes(targetTokens[i])) {
            return 30 - i;
        }
    }

    // Penalizar si corresponde a la temporada 1 cuando se pidió otra temporada
    if (s.includes("-s1") || (!s.includes("-" + num) && !s.includes("-" + roman))) {
        return -20;
    }

    return 0;
}

function scoreSlugCandidate(slug, titles) {
    if (!slug) return 0;
    var cleanS = normalizeText(slug).replace(/-/g, " ");
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = normalizeText(titles[i]).replace(/-/g, " ");
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

        if (words.length > 0 && matches > 0) {
            var ratio = (matches / words.length) * 80;
            score = Math.max(score, ratio);
        }
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
    if (!m3u8Url || !m3u8Url.includes(".m3u8")) return Promise.resolve("720p");
    return fetch(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function(res) { return res.ok ? res.text() : ""; })
        .then(function(text) {
            if (!text || !text.includes("#EXT-X-STREAM-INF")) {
                if (m3u8Url.includes("1080")) return "1080p";
                if (m3u8Url.includes("720")) return "720p";
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
// 2. MOTOR ANILIST GRAPHQL UNIVERSAL
// ==========================================

function queryAniList(title) {
    if (!title || hasJapaneseChars(title)) return Promise.resolve(null);

    var query = `
    query ($search: String) {
      Media (search: $search, type: ANIME) {
        id
        title {
          romaji
          english
          native
        }
        synonyms
        format
        episodes
        relations {
          edges {
            relationType
            node {
              id
              title {
                romaji
                english
              }
              format
              episodes
            }
          }
        }
      }
    }`;

    return fetch(ANILIST_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT
        },
        body: JSON.stringify({
            query: query,
            variables: { search: title }
        })
    })
    .then(function(res) {
        if (!res.ok) return null;
        return res.json();
    })
    .then(function(json) {
        return (json && json.data && json.data.Media) ? json.data.Media : null;
    })
    .catch(function() {
        return null;
    });
}

// ==========================================
// 3. PARSER DEL ÁRBOL DE SVELTEKIT
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
// 4. RESOLVERS DE STREAMING
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
                        return { url: m3uMatch[0], quality: q || "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                    });
                }
            }
            var directM3u = html.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
            if (directM3u) {
                return probeM3u8Quality(directM3u[0]).then(function(q) {
                    return { url: directM3u[0], quality: q || "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
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
                title: `${res.quality || "720p"} · ${embed.lang} · StreamWish`,
                quality: res.quality || "720p",
                url: res.url,
                headers: res.headers || {}
            };
        });
    }

    return Promise.resolve(null);
}

// ==========================================
// 5. BÚSQUEDA Y EXTRACCIÓN
// ==========================================

function searchAnimeAV1(queries) {
    var queryList = Array.isArray(queries) ? queries : [queries];

    function tryNextQuery(index) {
        if (index >= queryList.length) return Promise.resolve([]);
        var q = queryList[index];
        if (!q || hasJapaneseChars(q)) return tryNextQuery(index + 1);

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
// 6. FUNCIÓN PRINCIPAL EXPORTADA
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

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altTitles = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altTitles.length; i++) {
                var alt = altTitles[i].title || "";
                if (alt && !hasJapaneseChars(alt) && titles.indexOf(alt) === -1) {
                    titles.push(alt);
                }
            }

            // Consultar AniList GraphQL
            var searchTitle = origTitle || title;
            return queryAniList(searchTitle).then(function(aniData) {
                if (aniData) {
                    if (aniData.title) {
                        if (aniData.title.romaji && titles.indexOf(aniData.title.romaji) === -1) {
                            titles.unshift(aniData.title.romaji);
                        }
                        if (aniData.title.english && titles.indexOf(aniData.title.english) === -1) {
                            titles.push(aniData.title.english);
                        }
                    }
                    if (Array.isArray(aniData.synonyms)) {
                        for (var s = 0; s < aniData.synonyms.length; s++) {
                            var syn = aniData.synonyms[s];
                            if (syn && !hasJapaneseChars(syn) && titles.indexOf(syn) === -1) {
                                titles.push(syn);
                            }
                        }
                    }
                }

                var searchQueries = [];
                var directSlugs = [];

                for (var j = 0; j < titles.length; j++) {
                    var t = titles[j];
                    if (!t || hasJapaneseChars(t)) continue;

                    if (searchQueries.indexOf(t) === -1) searchQueries.push(t);

                    var wordsT = t.split(/\s+/);
                    if (wordsT.length > 2) {
                        var shortT = wordsT.slice(0, 2).join(" ");
                        if (searchQueries.indexOf(shortT) === -1) searchQueries.push(shortT);
                    }

                    var baseSlug = cleanSlug(t);
                    if (baseSlug) {
                        directSlugs = directSlugs.concat(getUniversalSeasonVariants(baseSlug, sNum, isMovie));
                    }
                }

                return searchAnimeAV1(searchQueries).then(function(slugs) {
                    var candidateSlugs = slugs.slice();

                    for (var s = 0; s < directSlugs.length; s++) {
                        var dSlug = directSlugs[s];
                        if (dSlug && candidateSlugs.indexOf(dSlug) === -1) {
                            candidateSlugs.push(dSlug);
                        }
                    }

                    // Filtrar candidatos con score >= 35
                    var validSlugs = [];
                    for (var k = 0; k < candidateSlugs.length; k++) {
                        var sc = scoreSlugCandidate(candidateSlugs[k], titles);
                        if (sc >= 35) {
                            validSlugs.push({ 
                                slug: candidateSlugs[k], 
                                score: sc + scoreSlugForSeason(candidateSlugs[k], sNum, isMovie) 
                            });
                        }
                    }

                    if (validSlugs.length === 0) return [];

                    validSlugs.sort(function(a, b) {
                        return b.score - a.score;
                    });

                    function tryNextSlug(index) {
                        if (index >= validSlugs.length) return Promise.resolve([]);
                        var slugToTry = validSlugs[index].slug;

                        return extractStreamsFromEpisodeData(slugToTry, eNum).then(function(streams) {
                            if (streams && streams.length > 0) return streams;
                            return tryNextSlug(index + 1);
                        });
                    }

                    return tryNextSlug(0);
                });
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
