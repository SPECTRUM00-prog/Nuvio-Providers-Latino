/**
 * Provider: JKAnime (Anime, Donghua y Películas) con AniList Engine y Buscador Nativo
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";
const BASE_URL = "https://jkanime.net";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// UTILIDADES Y DECODIFICADOR BASE64 PURO
// ==========================================

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
    return fetch(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
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
// CONSULTAS GRAPHQL A ANILIST
// ==========================================

function fetchAniListMapping(searchName) {
    if (!searchName || hasAsianChars(searchName)) return Promise.resolve([]);

    var gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title {
            romaji
            english
          }
          synonyms
          episodes
          seasonYear
          format
        }
      }
    }
    `;

    return fetch(ANILIST_GRAPHQL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ query: gqlQuery, variables: { search: searchName } })
    })
    .then(function(res) { return res.json(); })
    .then(function(json) {
        return (json && json.data && json.data.Page && json.data.Page.media) || [];
    })
    .catch(function() { return []; });
}

function resolveAniListTarget(aniListMedia, sNum, eNum, absoluteEp) {
    if (!aniListMedia || aniListMedia.length === 0) return null;

    var seasonKeywords = {
        1: ["season 1", "cour 1", "cour 2", "part 2", "2nd season", "1st season"],
        2: ["season 2", " ii ", "ii:", "ii ", "part 2", "cour 2", "2nd season"],
        3: ["season 3", " iii ", "iii:", "iii ", "3rd season"],
        4: ["season 4", " iv ", "iv:", "iv ", "final season", "4th season"]
    }[sNum] || [`season ${sNum}`];

    var matchingEntries = aniListMedia.filter(function(m) {
        var r = (m.title.romaji || "").toLowerCase();
        var e = (m.title.english || "").toLowerCase();
        var full = r + " " + e;

        if (sNum === 1) {
            if (full.includes("season 2") || full.includes("season 3") || full.includes("season 4") || full.includes(" ii") || full.includes(" iii")) {
                return false;
            }
            return true;
        }

        for (var i = 0; i < seasonKeywords.length; i++) {
            if (full.includes(seasonKeywords[i])) return true;
        }
        return false;
    });

    if (matchingEntries.length === 0) {
        var baseEntry = aniListMedia[0];
        return {
            slug: cleanTitle(baseEntry.title.romaji),
            targetEp: sNum > 1 ? absoluteEp : eNum
        };
    }

    if (matchingEntries.length > 1) {
        var part1 = matchingEntries.find(function(m) {
            var f = (m.title.romaji + " " + m.title.english).toLowerCase();
            return !f.includes("part 2") && !f.includes("cour 2") && !f.includes("2nd season");
        });

        var part2 = matchingEntries.find(function(m) {
            var f = (m.title.romaji + " " + m.title.english).toLowerCase();
            return f.includes("part 2") || f.includes("cour 2") || f.includes("2nd season");
        });

        if (part1 && part2 && part1.episodes) {
            if (eNum > part1.episodes) {
                return {
                    slug: cleanTitle(part2.title.romaji),
                    targetEp: eNum - part1.episodes
                };
            } else {
                return {
                    slug: cleanTitle(part1.title.romaji),
                    targetEp: eNum
                };
            }
        }
    }

    var selected = matchingEntries[0];
    var isContinuous = !selected.title.romaji.toLowerCase().includes("season") && !selected.title.romaji.toLowerCase().includes(" ii") && !selected.title.romaji.toLowerCase().includes(" iii");
    
    return {
        slug: cleanTitle(selected.title.romaji),
        targetEp: (isContinuous && sNum > 1) ? absoluteEp : eNum
    };
}

// ==========================================
// BUSCADOR NATIVO DE JKANIME (FALLBACK)
// ==========================================

function searchJKAnime(query) {
    if (!query || hasAsianChars(query)) return Promise.resolve([]);
    var searchUrl = `${BASE_URL}/buscar/${encodeURIComponent(query)}/1/`;

    return fetch(searchUrl, { headers: DEFAULT_HEADERS })
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
// RESOLVERS DE STREAMING
// ==========================================

function resolveStreamWish(url) {
    var idMatch = url.match(/\/(?:e|v|f)\/([a-zA-Z0-9]+)/);
    var targetUrl = idMatch ? "https://hlswish.com/e/" + idMatch[1] : url;

    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl },
        redirect: "follow"
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

function resolveVidHide(url) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }, redirect: "follow" })
        .then(function(res) {
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
                    if (streamUrl.startsWith("/")) streamUrl = host + streamUrl;
                    return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": finalUrl }).then(function(q) {
                        return { url: streamUrl, serverName: "VidHide", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": finalUrl } };
                    });
                }
                return null;
            });
        }).catch(function() { return null; });
}

function resolveMp4upload(url) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" }, redirect: "follow" })
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
                if (srcMatch) return { url: srcMatch[1], serverName: "MP4Upload", quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
            var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
            if (directMatch) return { url: directMatch[0], serverName: "MP4Upload", quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            return null;
        }).catch(function() { return null; });
}

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");
    return fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" })
        .then(function(res) { return res.text(); })
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
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }, redirect: "follow" })
        .then(function(res) { return res.text(); })
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
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("strwish") || u.includes("sfasthwish") || u.includes("flaswish") || u.includes("fasthwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) return resolveStreamWish(url);
    if (u.includes("vidhide") || u.includes("vidhidevip") || u.includes("callistanise") || u.includes("minochinos") || u.includes("filelions") || u.includes("morencius")) return resolveVidHide(url);
    if (u.includes("mp4upload")) return resolveMp4upload(url);
    if (u.includes("streamtape")) return resolveStreamtape(url);
    if (u.includes("/jkplayer/") || u.includes("playmudos")) return resolveDesuMagi(url);
    return Promise.resolve(null);
}

function extractStreamsFromEpisodePage(pageUrl) {
    return fetch(pageUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) { return res.ok ? res.text() : ""; })
        .then(function(html) {
            var rawEmbeds = [];

            var serversMatch = html.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
            if (serversMatch) {
                try {
                    var sArr = JSON.parse(serversMatch[1]);
                    for (var i = 0; i < sArr.length; i++) {
                        if (sArr[i] && sArr[i].remote) {
                            var dec = decodeBase64Safe(sArr[i].remote);
                            if (dec && dec.startsWith("http")) rawEmbeds.push(dec);
                        }
                    }
                } catch (e) {}
            }

            var b64Tokens = html.match(/aHR0cHM6[a-zA-Z0-9+/=_-]+/gi) || [];
            for (var j = 0; j < b64Tokens.length; j++) {
                var d = decodeBase64Safe(b64Tokens[j]);
                if (d && d.startsWith("http")) rawEmbeds.push(d);
            }

            var umRegex = /https?:\/\/jkanime\.net\/jkplayer\/(?:um|umv|uk)[^\s"'<>]+/gi, umMatch;
            while ((umMatch = umRegex.exec(html)) !== null) {
                rawEmbeds.push(umMatch[0].replace(/&amp;/g, "&"));
            }

            var uniqueEmbeds = rawEmbeds.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            if (uniqueEmbeds.length === 0) return [];

            var promises = uniqueEmbeds.map(function(embedUrl) {
                return dispatchResolver(embedUrl)
                    .then(function(res) {
                        if (!res || !res.url) return null;
                        var q = res.quality || "720p";
                        return {
                            name: "JKAnime",
                            title: `${q} · SUB · ${res.serverName}`,
                            quality: q,
                            url: res.url,
                            headers: res.headers || {}
                        };
                    })
                    .catch(function() { return null; });
            });

            return Promise.all(promises);
        })
        .then(function(results) { return results.filter(function(st) { return st !== null; }); })
        .catch(function() { return []; });
}

function getAbsoluteEpisodeNumber(meta, season, episode) {
    if (!meta || !meta.seasons || season <= 1) return episode || 1;
    var totalPrevious = 0;
    for (var i = 0; i < meta.seasons.length; i++) {
        var s = meta.seasons[i];
        if (s.season_number > 0 && s.season_number < season) totalPrevious += (s.episode_count || 0);
    }
    return totalPrevious + (parseInt(episode, 10) || 1);
}

// ==========================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[JKAnime] Buscando TMDB ID ${tmdbId} (${mediaType})`);
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
            // Permitir Japonés (ja), Chino/Donghua (zh) y Coreano (ko)
            var isAsianAnim = (meta.original_language === "ja" || meta.original_language === "zh" || meta.original_language === "ko") ||
                              (meta.origin_country && meta.origin_country.some(function(c) { return ["JP", "CN", "KR", "TW", "HK"].indexOf(c) !== -1; })) ||
                              (meta.production_countries && meta.production_countries.some(function(c) { return ["JP", "CN", "KR"].indexOf(c.iso_3166_1) !== -1; }));

            if (!isAsianAnim) {
                console.log("[JKAnime] Contenido no asiático. Abortando.");
                return [];
            }

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
            var absoluteEp = isMovie ? 1 : getAbsoluteEpisodeNumber(meta, sNum, eNum);

            // 1. Consultar AniList GraphQL + Buscador Nativo de JKAnime
            return Promise.all([
                fetchAniListMapping(searchKeyword),
                searchJKAnime(searchKeyword)
            ]).then(function(results) {
                var aniListMedia = results[0];
                var nativeSlugs = results[1];

                var aniTarget = resolveAniListTarget(aniListMedia, sNum, eNum, absoluteEp);
                var candidateSlugs = [];

                if (aniTarget && aniTarget.slug) {
                    candidateSlugs.push(aniTarget.slug);
                    if (year) candidateSlugs.push(`${aniTarget.slug}-${year}`);
                }

                for (var n = 0; n < nativeSlugs.length; n++) {
                    if (candidateSlugs.indexOf(nativeSlugs[n]) === -1) {
                        candidateSlugs.push(nativeSlugs[n]);
                    }
                }

                // Añadir slugs directos basados en los títulos de TMDB con y sin año
                for (var t = 0; t < titles.length; t++) {
                    var sBase = cleanTitle(titles[t]);
                    if (sBase) {
                        if (candidateSlugs.indexOf(sBase) === -1) candidateSlugs.push(sBase);
                        if (year && candidateSlugs.indexOf(`${sBase}-${year}`) === -1) candidateSlugs.push(`${sBase}-${year}`);
                    }
                }

                // Filtrar con score >= 35
                var scoredSlugs = [];
                for (var k = 0; k < candidateSlugs.length; k++) {
                    var sc = scoreCandidate(candidateSlugs[k], titles, year);
                    if (sc >= 35) {
                        scoredSlugs.push({ slug: candidateSlugs[k], score: sc });
                    }
                }

                if (scoredSlugs.length === 0) return [];

                scoredSlugs.sort(function(a, b) { return b.score - a.score; });

                var pageUrlsToTry = [];
                for (var sIdx = 0; sIdx < scoredSlugs.length; sIdx++) {
                    var currentSlug = scoredSlugs[sIdx].slug;
                    if (isMovie) {
                        pageUrlsToTry.push(`${BASE_URL}/${currentSlug}/pelicula/`);
                        pageUrlsToTry.push(`${BASE_URL}/${currentSlug}/1/`);
                    } else {
                        pageUrlsToTry.push(`${BASE_URL}/${currentSlug}/${eNum}/`);
                        if (sNum > 1 && absoluteEp !== eNum) {
                            pageUrlsToTry.push(`${BASE_URL}/${currentSlug}/${absoluteEp}/`);
                        }
                    }
                }

                function tryPageUrls(pIdx) {
                    if (pIdx >= pageUrlsToTry.length) return Promise.resolve([]);
                    var targetUrl = pageUrlsToTry[pIdx];

                    return extractStreamsFromEpisodePage(targetUrl).then(function(streams) {
                        if (streams && streams.length > 0) return streams;
                        return tryPageUrls(pIdx + 1);
                    });
                }

                return tryPageUrls(0);
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
