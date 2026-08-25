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

function hasJapaneseChars(str) {
    return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(str);
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
    return fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }, redirect: "follow" })
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
                        return { url: streamUrl, serverName: "StreamWish", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
                    });
                }
            }
            return null;
        });
    }).catch(function() { return null; });
}

function resolveVidHide(url) {
    var targetUrl = url;
    return fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }, redirect: "follow" })
    .then(function(res) {
        var hostMatch = (res.url || targetUrl).match(/^(https?:\/\/[^/]+)/i);
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
                return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": res.url || targetUrl }).then(function(q) {
                    return { url: streamUrl, serverName: "VidHide", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": res.url || targetUrl } };
                });
            }
            return null;
        });
    }).catch(function() { return null; });
}

function resolveMp4upload(url) {
    var targetUrl = url;
    return fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" }, redirect: "follow" })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2]), parseInt(packMatch[3]), packMatch[4].split("|"));
            var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4[^"']*)["']/i) || unpacked.match(/["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
            if (srcMatch) return { url: srcMatch[1], serverName: "Mp4upload", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
        }
        var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
        if (directMatch) return { url: directMatch[0], serverName: "Mp4upload", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
        return null;
    }).catch(function() { return null; });
}

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");
    return fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var regex = /document\.getElementById\(['"](?:robotlink|ideoolink|noroot)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:\(['"]([^'"]+)['"]\)\.substring\((\d+)\)|['"]([^'"]+)['"])/i;
        var match = html.match(regex);
        if (match) {
            var part1 = match[1];
            var part2 = match[2] && match[3] ? match[2].substring(parseInt(match[3])) : (match[4] ? match[4] : "");
            return { url: "https:" + part1 + part2, serverName: "Streamtape", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
        }
        return null;
    }).catch(function() { return null; });
}

function resolveDesuMagi(url) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }, redirect: "follow" })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var m3u8Match = html.match(/https?:\/\/[^"'\s\\]+playmudos\.com\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i) || html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
        if (m3u8Match) {
            var streamUrl = m3u8Match[0];
            return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                return { url: streamUrl, serverName: "Desu", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": url } };
            });
        }
        return null;
    }).catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();
    if (u.includes("streamwish") || u.includes("hlswish") || u.includes("strwish") || u.includes("sfasthwish") || u.includes("flaswish") || u.includes("fasthwish") || u.includes("hanerix") || u.includes("hglink") || u.includes("vibuxer")) return resolveStreamWish(url);
    if (u.includes("vidhide") || u.includes("callistanise") || u.includes("minochinos")) return resolveVidHide(url);
    if (u.includes("mp4upload")) return resolveMp4upload(url);
    if (u.includes("streamtape")) return resolveStreamtape(url);
    if (u.includes("/jkplayer/um") || u.includes("playmudos")) return resolveDesuMagi(url);
    return Promise.resolve(null);
}

// ==========================================
// BÚSQUEDA AJAX SUPER-RÁPIDA Y PARALELA
// ==========================================

function searchJkanimeAjax(query) {
    if (!query) return Promise.resolve([]);
    var url = `${BASE_URL}/ajax/ajax_search/?q=${encodeURIComponent(query)}`;
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest" } })
        .then(function(res) { return res.json(); })
        .then(function(json) {
            var slugs = [];
            if (Array.isArray(json)) {
                for (var i = 0; i < json.length; i++) {
                    if (json[i].link) {
                        var s = json[i].link.replace(/\//g, "").trim();
                        if (s) slugs.push(s);
                    }
                }
            }
            return slugs;
        }).catch(function() { return []; });
}

function findFirstValidUrl(urls) {
    return new Promise(function(resolve) {
        if (!urls || urls.length === 0) return resolve(null);
        var pending = urls.length;
        var resolved = false;
        urls.forEach(function(url) {
            fetch(url, { headers: DEFAULT_HEADERS, redirect: "follow" })
                .then(function(res) {
                    if (res.ok && res.status === 200 && !res.url.endsWith("jkanime.net/") && !resolved) {
                        resolved = true;
                        res.text().then(function(html) { resolve({ url: res.url, html: html }); });
                    } else {
                        if (--pending === 0 && !resolved) resolve(null);
                    }
                })
                .catch(function() {
                    if (--pending === 0 && !resolved) resolve(null);
                });
        });
    });
}

function extractStreamsFromHtml(html) {
    var rawEmbeds = [];
    var serversMatch = html.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
    if (serversMatch) {
        try {
            var sArr = JSON.parse(serversMatch[1]);
            for (var i = 0; i < sArr.length; i++) {
                var item = sArr[i];
                if (item && item.remote) {
                    var decodedUrl = decodeBase64Safe(item.remote);
                    if (decodedUrl && decodedUrl.startsWith("http")) rawEmbeds.push(decodedUrl);
                }
            }
        } catch (e) {}
    }
    var b64Tokens = html.match(/aHR0cHM6[a-zA-Z0-9+/=_-]+/gi) || [];
    for (var j = 0; j < b64Tokens.length; j++) {
        var decoded = decodeBase64Safe(b64Tokens[j]);
        if (decoded && decoded.startsWith("http")) rawEmbeds.push(decoded);
    }
    var umRegex = /https?:\/\/jkanime\.net\/jkplayer\/um[^\s"'<>]+/gi;
    var umMatch;
    while ((umMatch = umRegex.exec(html)) !== null) rawEmbeds.push(umMatch[0].replace(/&amp;/g, "&"));

    var uniqueEmbeds = rawEmbeds.filter(function(item, pos, self) { return item && self.indexOf(item) === pos; });
    if (uniqueEmbeds.length === 0) return Promise.resolve([]);

    var promises = uniqueEmbeds.map(function(embedUrl) {
        return dispatchResolver(embedUrl).then(function(res) {
            if (!res || !res.url) return null;
            var sName = res.serverName || getServerLabel(res.url);
            var q = res.quality || "720p";
            return { name: "JKAnime", title: `${q} · SUB · ${sName}`, quality: q, url: res.url, headers: res.headers || {} };
        }).catch(function() { return null; });
    });

    return Promise.all(promises).then(function(results) { return results.filter(function(st) { return st !== null; }); });
}

// ==========================================
// CÁLCULO DE EPISODIOS CONTINUOS
// ==========================================

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
                console.log("[JKAnime] Contenido no japonés. Abortando (0s).");
                return [];
            }

            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var searchQueries = [];

            if (title && !hasJapaneseChars(title)) searchQueries.push(title);
            var altTitles = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altTitles.length; i++) {
                var alt = altTitles[i].title || "";
                if (alt && !hasJapaneseChars(alt)) searchQueries.push(alt);
            }
            if (origTitle && !hasJapaneseChars(origTitle)) searchQueries.push(origTitle);

            // Buscar en paralelo todos los términos usando la API rápida de AJAX
            var ajaxPromises = searchQueries.map(function(q) { return searchJkanimeAjax(q); });

            return Promise.all(ajaxPromises).then(function(resultsArr) {
                var candidateSlugs = [];
                resultsArr.forEach(function(arr) { candidateSlugs = candidateSlugs.concat(arr); });
                candidateSlugs.push(normalizeText(title).replace(/\s+/g, "-"));
                
                // Deduplicar
                candidateSlugs = candidateSlugs.filter(function(item, pos, self) {
                    return item && self.indexOf(item) === pos;
                });

                if (candidateSlugs.length === 0) return [];

                var absoluteEp = isMovie ? 1 : getAbsoluteEpisodeNumber(meta, sNum, eNum);
                var candidateUrls = [];

                candidateSlugs.forEach(function(slug) {
                    if (isMovie) {
                        candidateUrls.push(`${BASE_URL}/${slug}/pelicula/`);
                        candidateUrls.push(`${BASE_URL}/${slug}/1/`);
                    } else {
                        candidateUrls.push(`${BASE_URL}/${slug}/${eNum}/`);
                        if (absoluteEp !== eNum) candidateUrls.push(`${BASE_URL}/${slug}/${absoluteEp}/`);
                        // Offset fallbacks for split cour "Part 2" (ej: KonoSuba T3 o Mushoku Tensei T2)
                        if (eNum > 11) candidateUrls.push(`${BASE_URL}/${slug}/${eNum - 11}/`);
                        if (eNum > 12) candidateUrls.push(`${BASE_URL}/${slug}/${eNum - 12}/`);
                        if (eNum > 13) candidateUrls.push(`${BASE_URL}/${slug}/${eNum - 13}/`);
                    }
                });

                // Deduplicar URLs candidatas
                candidateUrls = candidateUrls.filter(function(item, pos, self) { return item && self.indexOf(item) === pos; });

                console.log(`[JKAnime] Probando ${candidateUrls.length} combinaciones en paralelo...`);

                return findFirstValidUrl(candidateUrls).then(function(validPage) {
                    if (!validPage) {
                        console.log("[JKAnime] Ningún episodio coincidió en el catálogo.");
                        return [];
                    }
                    console.log(`[JKAnime] Episodio encontrado: ${validPage.url}`);
                    return extractStreamsFromHtml(validPage.html);
                });
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
