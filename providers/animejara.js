/**
 * Provider: AnimeJara (Anime Series y Películas en Sub, Latino y Castellano)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://animejara.com";
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const MULTIPLAYER_BASE = "https://multiplayer.streamhj.top/player/multiplayer/embed.php";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// UTILIDADES Y NORMALIZACIÓN
// ==========================================

function decodeHtmlEntities(str) {
    if (!str) return "";
    return str
        .replace(/&quot;/g, '"')
        .replace(/&#038;/g, "&")
        .replace(/&amp;/g, "&")
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

function cleanTitle(str) {
    if (!str) return "";
    return decodeHtmlEntities(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function hasJapaneseChars(str) {
    if (!str) return false;
    return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(str);
}

function scoreAnime(item, titles, year) {
    if (!item) return 0;
    var tItem = cleanTitle(item.titulo || item.slug || "");
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        if (tItem === t) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (tItem.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0 && matches > 0) {
            var ratio = (matches / words.length) * 75;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && year && String(item.anio || "").indexOf(String(year)) !== -1) {
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

    return fetch(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    })
    .then(function(res) {
        if (!res.ok) return "720p";
        return res.text();
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            if (/1080/i.test(m3u8Url)) return "1080p";
            if (/720/i.test(m3u8Url)) return "720p";
            return "720p";
        }

        var maxH = 0;
        var resRegex = /RESOLUTION=\d+x(\d+)/gi;
        var match;
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
    .catch(function() {
        return "720p";
    });
}

function getServerLabel(url) {
    if (!url) return "Online";
    var u = url.toLowerCase();
    if (u.includes("nyuu") || u.includes("streamhj")) return "Nyuu VIP";
    if (u.includes("byse") || u.includes("filemoon")) return "Filemoon";
    if (u.includes("hgcloud") || u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish")) return "StreamWish";
    if (u.includes("vidhide") || u.includes("minochinos") || u.includes("callistanise")) return "VidHide";
    if (u.includes("mp4upload")) return "MP4Upload";
    return "Online";
}

// ==========================================
// RESOLVERS DE STREAMING
// ==========================================

function resolveNyuu(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://multiplayer.streamhj.top/" },
        redirect: "follow"
    })
    .then(function(res) {
        var cType = res.headers.get("content-type") || "";
        if (cType.includes("mpegurl") || res.url.includes(".m3u8")) {
            return probeM3u8Quality(res.url, { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                return { url: res.url, quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            });
        }
        return res.text().then(function(html) {
            var m3u8Match = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                            html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (m3u8Match) {
                var streamUrl = m3u8Match[1].replace(/\\/g, "");
                return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                    return { url: streamUrl, quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
            var mp4Match = html.match(/["'](https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)["']/i);
            if (mp4Match) {
                return { url: mp4Match[1], quality: "1080p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
            return null;
        });
    })
    .catch(function() { return null; });
}

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
                return { url: direct[1], quality: q, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            });
        }
        var unpacked = unpackDeanEdwards(html);
        if (unpacked) {
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                    return { url: m3u8[0], quality: q, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
                });
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
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) {
            return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                return { url: direct[1], quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            });
        }
        var unpacked = unpackDeanEdwards(html);
        if (unpacked) {
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                    return { url: m3u8[0], quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
        }
        return null;
    })
    .catch(function() { return null; });
}

function resolveVidHide(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": url },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var direct = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (direct) {
            return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                return { url: direct[1], quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            });
        }
        var unpacked = unpackDeanEdwards(html);
        if (unpacked) {
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                    return { url: m3u8[0], quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(rawUrl) {
    if (!rawUrl) return Promise.resolve(null);
    var u = rawUrl.toLowerCase();

    if (u.includes("nyuu") || u.includes("streamhj")) return resolveNyuu(rawUrl);
    if (u.includes("hgcloud") || u.includes("streamwish") || u.includes("hlswish") || u.includes("flaswish")) return resolveStreamWish(rawUrl);
    if (u.includes("byse") || u.includes("filemoon")) return resolveFilemoon(rawUrl);
    if (u.includes("vidhide") || u.includes("minochinos") || u.includes("callistanise")) return resolveVidHide(rawUrl);

    return Promise.resolve(null);
}

// ==========================================
// CONSULTAS API Y MULTIPLAYER
// ==========================================

function searchAnimeJara(query) {
    if (!query || hasJapaneseChars(query)) return Promise.resolve([]);

    return fetch(AJAX_URL, {
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": `${BASE_URL}/`
        },
        body: "action=live_search&s=" + encodeURIComponent(query)
    })
    .then(function(res) { return res.json(); })
    .then(function(json) {
        if (json && json.success && json.data && Array.isArray(json.data.animes)) {
            return json.data.animes;
        }
        return [];
    })
    .catch(function() { return []; });
}

function searchMultiQuery(queries) {
    function tryNext(idx) {
        if (idx >= queries.length) return Promise.resolve([]);
        return searchAnimeJara(queries[idx]).then(function(animes) {
            if (animes && animes.length > 0) return animes;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

function extractAnimeId(animeItem) {
    var isMovie = (animeItem.tipo && (animeItem.tipo.toLowerCase() === "movie" || animeItem.tipo.toLowerCase() === "pelicula"));
    var animeUrl = `${BASE_URL}${isMovie ? "/movie/" : "/anime/"}${animeItem.slug}`;

    return fetch(animeUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) return null;
            return res.text();
        })
        .then(function(html) {
            var idMatch = html.match(/(?:ANIME_ID|ID_ANIME|idanime|anime_id|data-id|data-anime)\s*[:=]\s*["']?(\d+)["']?/i);
            if (idMatch && idMatch[1]) {
                return idMatch[1];
            }
            return null;
        })
        .catch(function() { return null; });
}

function extractStreamsFromMultiplayer(animeId, episodeNum) {
    var playerUrl = `${MULTIPLAYER_BASE}?idanime=${animeId}&idcapitulo=${episodeNum}`;

    return fetch(playerUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": `${BASE_URL}/`,
            "Origin": BASE_URL
        }
    })
    .then(function(res) {
        if (!res.ok) return [];
        return res.text();
    })
    .then(function(html) {
        var cleanHtml = decodeHtmlEntities(html);

        // Extraer idioma desde el encabezado h2
        var lang = "SUB";
        var titleMatch = cleanHtml.match(/<h2[^>]*>(.*?)<\/h2>/i);
        if (titleMatch) {
            var tH2 = titleMatch[1].toUpperCase();
            if (tH2.indexOf("LATINO") !== -1 || tH2.indexOf("LAT") !== -1) lang = "LAT";
            else if (tH2.indexOf("CASTELLANO") !== -1 || tH2.indexOf("CAS") !== -1) lang = "CAS";
        }

        // Extraer enlaces a los que llama playVideo("URL")
        var serverUrls = [];
        var playRegex = /playVideo\(\s*["']([^"']+)["']\s*\)/gi;
        var pMatch;
        while ((pMatch = playRegex.exec(cleanHtml)) !== null) {
            var sUrl = pMatch[1];
            if (sUrl && sUrl.startsWith("http") && serverUrls.indexOf(sUrl) === -1) {
                serverUrls.push(sUrl);
            }
        }

        if (serverUrls.length === 0) return [];

        var resolvePromises = serverUrls.map(function(sUrl) {
            var serverName = getServerLabel(sUrl);
            return dispatchResolver(sUrl).then(function(res) {
                if (res && res.url) {
                    return {
                        name: "AnimeJara",
                        title: `${res.quality || "720p"} · ${lang} · ${serverName}`,
                        quality: res.quality || "720p",
                        url: res.url,
                        headers: res.headers || {}
                    };
                }
                return null;
            });
        });

        return Promise.all(resolvePromises).then(function(results) {
            return results.filter(function(st) { return st !== null; });
        });
    })
    .catch(function() { return []; });
}

// ==========================================
// FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[AnimeJara] Buscando TMDB ID ${tmdbId} (${mediaType})`);
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
                console.log("[AnimeJara] Contenido no japonés. Abortando.");
                return [];
            }

            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = (isMovie ? meta.release_date : meta.first_air_date || "").slice(0, 4);

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
                if (!rawT || hasJapaneseChars(rawT)) continue;

                var clean = cleanTitle(rawT);
                if (clean && searchQueries.indexOf(clean) === -1) searchQueries.push(clean);

                var words = clean.split(/\s+/).filter(function(w) { return w.length > 2; });
                if (words.length >= 2) {
                    var twoWords = words.slice(0, 2).join(" ");
                    if (searchQueries.indexOf(twoWords) === -1) searchQueries.push(twoWords);
                }
            }

            return searchMultiQuery(searchQueries).then(function(animes) {
                if (!animes || animes.length === 0) return [];

                // 1. Filtrar candidatos válidos (score >= 35)
                var scored = [];
                for (var a = 0; a < animes.length; a++) {
                    var sc = scoreAnime(animes[a], uniqueTitles, year);
                    if (sc >= 35) {
                        scored.push({ anime: animes[a], score: sc });
                    }
                }

                if (scored.length === 0) return [];

                // 2. Ordenar por mayor precisión
                scored.sort(function(a, b) {
                    return b.score - a.score;
                });

                function tryNextAnime(aIdx) {
                    if (aIdx >= scored.length) return Promise.resolve([]);
                    var targetAnime = scored[aIdx].anime;

                    return extractAnimeId(targetAnime).then(function(animeId) {
                        if (!animeId) return tryNextAnime(aIdx + 1);

                        return extractStreamsFromMultiplayer(animeId, eNum).then(function(streams) {
                            if (streams && streams.length > 0) return streams;
                            return tryNextAnime(aIdx + 1);
                        });
                    });
                }

                return tryNextAnime(0);
            });
        })
        .then(function(streams) {
            console.log(`[AnimeJara] ✓ ${streams.length} streams extraídos`);
            return streams;
        })
        .catch(function(err) {
            console.log(`[AnimeJara] Error general: ${err.message}`);
            return [];
        });
}

module.exports = { getStreams };
