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
// DECODIFICADOR BASE64 PURO (HERMES SAFE)
// ==========================================

function decodeBase64Safe(input) {
    if (!input) return "";
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(input).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4 !== 0) str += "=";
    
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

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

function isSlugSimilar(query, slug) {
    if (!query || !slug) return false;
    var cleanQ = normalizeText(query).replace(/-/g, " ");
    var cleanS = normalizeText(slug).replace(/-/g, " ");
    var qWords = cleanQ.split(/\s+/).filter(function(w) { return w.length > 2; });

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
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("strwish") || u.includes("sfasthwish") || u.includes("flaswish") || u.includes("fasthwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) return "StreamWish";
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) return "VidHide";
    if (u.includes("filemoon") || u.includes("bysekoze")) return "Filemoon";
    if (u.includes("streamtape")) return "Streamtape";
    if (u.includes("mp4upload")) return "Mp4upload";
    if (u.includes("playmudos") || u.includes("/jkplayer/um")) return "Desu";
    return "JKAnime";
}

// ==========================================
// RESOLVERS DE STREAMING
// ==========================================

function resolveStreamWish(url) {
    var targetUrl = url;
    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
        redirect: "follow"
    })
    .then(function(res) {
        var hostMatch = (res.url || targetUrl).match(/^(https?:\/\/[^/]+)/i);
        var host = hostMatch ? hostMatch[1] : "https://flaswish.com";

        return res.text().then(function(html) {
            var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
            if (packMatch) {
                var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
                var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
                if (m3u8Match) {
                    var streamUrl = m3u8Match[1];
                    if (streamUrl.startsWith("/")) streamUrl = host + streamUrl;
                    return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
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
        });
    })
    .catch(function() { return null; });
}

function resolveVidHide(url) {
    var targetUrl = url;
    return fetch(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
        redirect: "follow"
    })
    .then(function(res) {
        var finalUrl = res.url || targetUrl;
        var hostMatch = finalUrl.match(/^(https?:\/\/[^/]+)/i);
        var host = hostMatch ? hostMatch[1] : "https://callistanise.com";

        return res.text().then(function(html) {
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
                if (streamUrl.startsWith("/")) streamUrl = host + streamUrl;
                return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": finalUrl }).then(function(q) {
                    return {
                        url: streamUrl,
                        serverName: "VidHide",
                        quality: q,
                        headers: { "User-Agent": USER_AGENT, "Referer": finalUrl }
                    };
                });
            }

            return null;
        });
    })
    .catch(function() { return null; });
}

function resolveMp4upload(url) {
    var targetUrl = url;
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
                           unpacked.match(/["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
            if (srcMatch) {
                return {
                    url: srcMatch[1],
                    serverName: "Mp4upload",
                    quality: "720p",
                    headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }
                };
            }
        }
        var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
        if (directMatch) {
            return {
                url: directMatch[0],
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

function resolveDesuMagi(url) {
    return fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var m3u8Match = html.match(/https?:\/\/[^"'\s\\]+playmudos\.com\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i) ||
                        html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
        if (m3u8Match) {
            var streamUrl = m3u8Match[0];
            return {
                url: streamUrl,
                serverName: "Desu",
                quality: "1080p",
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

    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("strwish") || u.includes("sfasthwish") || u.includes("flaswish") || u.includes("fasthwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) {
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
    if (u.includes("/jkplayer/um") || u.includes("playmudos")) {
        return resolveDesuMagi(url);
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
                        if (isSlugSimilar(q, slug)) {
                            matches.push(slug);
                        }
                    }
                }

                if (matches.length > 0) {
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
    return fetch(pageUrl, { headers: DEFAULT_HEADERS })
        .then(function(res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.text();
        })
        .then(function(html) {
            var rawEmbeds = [];

            // 1. Extraer del objeto var servers = [...]
            var serversMatch = html.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
            if (serversMatch) {
                try {
                    var sArr = JSON.parse(serversMatch[1]);
                    for (var i = 0; i < sArr.length; i++) {
                        var item = sArr[i];
                        if (item && item.remote) {
                            var decodedUrl = decodeBase64Safe(item.remote);
                            if (decodedUrl && decodedUrl.startsWith("http")) {
                                rawEmbeds.push(decodedUrl);
                            }
                        }
                    }
                } catch (e) {}
            }

            // 2. Extraer tokens Base64 con prefijo "aHR0cHM6" (https:)
            var b64Tokens = html.match(/aHR0cHM6[a-zA-Z0-9+/=_-]+/gi) || [];
            for (var j = 0; j < b64Tokens.length; j++) {
                var decoded = decodeBase64Safe(b64Tokens[j]);
                if (decoded && decoded.startsWith("http")) {
                    rawEmbeds.push(decoded);
                }
            }

            // 3. Extraer reproductores Desu / Magi (/jkplayer/um?e=...)
            var umRegex = /https?:\/\/jkanime\.net\/jkplayer\/um[^\s"'<>]+/gi;
            var umMatch;
            while ((umMatch = umRegex.exec(html)) !== null) {
                rawEmbeds.push(umMatch[0].replace(/&amp;/g, "&"));
            }

            var uniqueEmbeds = rawEmbeds.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            if (uniqueEmbeds.length === 0) {
                return [];
            }

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
        .catch(function() {
            return [];
        });
}

// ==========================================
// CÁLCULO DE EPISODIOS CONTINUOS
// ==========================================

function getAbsoluteEpisodeNumber(meta, season, episode) {
    if (!meta || !meta.seasons || season <= 1) {
        return episode || 1;
    }

    var totalPrevious = 0;
    for (var i = 0; i < meta.seasons.length; i++) {
        var s = meta.seasons[i];
        if (s.season_number > 0 && s.season_number < season) {
            totalPrevious += (s.episode_count || 0);
        }
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
    var eNum = parseInt(episode, 10) || 1;
    var tmdbUrl = `https://api.themoviedb.org/3/${isMovie ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-MX&append_to_response=alternative_titles`;

    return fetch(tmdbUrl)
        .then(function(res) {
            if (!res.ok) throw new Error("TMDB HTTP " + res.status);
            return res.json();
        })
        .then(function(meta) {
            // Filtro de Origen: Descartar producciones no japonesas (evita South Park, Family Guy, The Big Bang Theory)
            var isJapanese = (meta.original_language === "ja") ||
                             (meta.origin_country && meta.origin_country.indexOf("JP") !== -1) ||
                             (meta.production_countries && meta.production_countries.some(function(c) { return c.iso_3166_1 === "JP"; }));

            if (!isJapanese) {
                console.log("[JKAnime] Contenido no japonés (Anime). Descartando consulta.");
                return [];
            }

            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;

            // Recolectar todos los títulos alternativos en Romaji e Inglés
            var searchQueries = [];

            // Añadir variantes de temporadas (ej: Konosuba 3, KonoSuba Season 3)
            if (sNum > 1 && !isMovie) {
                searchQueries.push(`konosuba ${sNum}`);
                if (title && !hasJapaneseChars(title)) {
                    searchQueries.push(`${title} ${sNum}`);
                }
            }

            // Título principal
            if (title && !hasJapaneseChars(title)) {
                searchQueries.push(title);
                var wordsT = title.split(/\s+/);
                if (wordsT.length > 2) searchQueries.push(wordsT.slice(0, 2).join(" "));
            }

            // Títulos alternativos desde TMDB
            var altTitles = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altTitles.length; i++) {
                var alt = altTitles[i].title || "";
                if (alt && !hasJapaneseChars(alt)) {
                    if (sNum > 1 && !isMovie) {
                        searchQueries.push(`${alt} ${sNum}`);
                    }
                    searchQueries.push(alt);
                    var wordsA = alt.split(/\s+/);
                    if (wordsA.length > 3) searchQueries.push(wordsA.slice(0, 3).join(" "));
                }
            }

            if (origTitle && origTitle !== title && !hasJapaneseChars(origTitle)) {
                searchQueries.push(origTitle);
            }

            // Deduplicar términos de búsqueda
            searchQueries = searchQueries.filter(function(item, pos, self) {
                return item && self.indexOf(item) === pos;
            });

            var absoluteEp = isMovie ? 1 : getAbsoluteEpisodeNumber(meta, sNum, eNum);
            var cleanT = cleanSlug(title);

            return searchJkanime(searchQueries).then(function(slugs) {
                var candidateSlugs = slugs.slice();

                if (sNum > 1 && !isMovie) {
                    if (cleanT) candidateSlugs.push(`${cleanT}-${sNum}`);
                }

                if (cleanT && candidateSlugs.indexOf(cleanT) === -1 && isSlugSimilar(title, cleanT)) {
                    candidateSlugs.push(cleanT);
                }

                if (candidateSlugs.length === 0) {
                    return [];
                }

                function tryNextSlug(index) {
                    if (index >= candidateSlugs.length) return Promise.resolve([]);
                    var s = candidateSlugs[index];

                    // Si el slug incluye el número de temporada (ej: kono-subarashii-sekai-ni-shukufuku-wo-3), usa el capítulo relativo (eNum)
                    // Si es una serie continua (ej: one-piece), usa el número absoluto continuo
                    var targetEp = (s.endsWith("-" + sNum) || s.includes("season") || s.includes("-" + sNum + "-")) ? eNum : absoluteEp;

                    var pageUrl = isMovie
                        ? `${BASE_URL}/${s}/pelicula/`
                        : `${BASE_URL}/${s}/${targetEp}/`;

                    return extractStreamsFromEpisodePage(pageUrl).then(function(streams) {
                        if (streams && streams.length > 0) return streams;

                        if (!isMovie && targetEp !== eNum) {
                            var altUrl = `${BASE_URL}/${s}/${eNum}/`;
                            return extractStreamsFromEpisodePage(altUrl).then(function(altStreams) {
                                if (altStreams && altStreams.length > 0) return altStreams;
                                return tryNextSlug(index + 1);
                            });
                        }

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
