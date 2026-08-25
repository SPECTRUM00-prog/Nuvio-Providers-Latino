/**
 * Provider: AnimeJara (Anime Series y Películas en Sub, Latino y Castellano)
 * Motor: 100% Cadenas de Promesas (Compatible con Hermes / FireTV / Desktop)
 * Zero-Dependencies: Sin async/await, sin librerías externas.
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://animejara.com";
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const MULTIPLAYER_HOST = "multiplayer.streamhj.top";
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
    var rawName = item.title || item.titulo || item.name || item.slug || "";
    var tItem = cleanTitle(rawName);
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

    var itemYear = item.year || item.anio || item.release_date || "";
    if (score > 0 && year && String(itemYear).indexOf(String(year)) !== -1) {
        score += 20;
    }

    return score;
}

function unpackDeanEdwards(p, a, c, k) {
    if (arguments.length === 1 && typeof p === "string") {
        var html = p;
        var match = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\('\|'\)/);
        if (!match) {
            match = html.match(/eval\(function\(p,a,c,k,e,[rd]\)\{[\s\S]+?\}\('(.*?)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/);
        }
        if (!match) return "";
        p = match[1];
        a = parseInt(match[2], 10);
        c = parseInt(match[3], 10);
        k = match[4].split("|");
    }

    if (!k || !Array.isArray(k)) return "";

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
    if (u.indexOf("byse") !== -1 || u.indexOf("filemoon") !== -1) return "Filemoon";
    if (u.indexOf("hgcloud") !== -1 || u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("flaswish") !== -1 || u.indexOf("audinifer") !== -1 || u.indexOf("vibuxer") !== -1) return "StreamWish";
    if (u.indexOf("vidhide") !== -1 || u.indexOf("filelions") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("callistanise") !== -1) return "VidHide";
    if (u.indexOf("mp4upload") !== -1) return "MP4Upload";
    if (u.indexOf("streamtape") !== -1) return "Streamtape";
    if (u.indexOf("yourupload") !== -1 || u.indexOf("nyuu.streamhj") !== -1) return "YourUpload";
    if (u.indexOf("uqload") !== -1) return "Uqload";
    if (u.indexOf("mixdrop") !== -1 || u.indexOf("mxdrop") !== -1 || u.indexOf("miixdrop") !== -1) return "Mixdrop";
    return "Online";
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

function resolveMp4upload(url) {
    var embedUrl = url;
    if (embedUrl.indexOf("embed-") === -1) {
        var idMatch = embedUrl.match(/mp4upload\.com\/(?:embed-|v\/)?([a-zA-Z0-9]+)/);
        if (idMatch) {
            embedUrl = "https://www.mp4upload.com/embed-" + idMatch[1] + ".html";
        }
    }

    return fetch(embedUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": "https://www.mp4upload.com/"
        },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        if (!html) return null;

        var quality = "720p";
        if (html.indexOf("FHD") !== -1 || html.indexOf("fhd.png") !== -1 || html.indexOf("1080") !== -1) {
            quality = "1080p";
        } else if (html.indexOf("HD") !== -1 || html.indexOf("hd.png") !== -1 || html.indexOf("720") !== -1) {
            quality = "720p";
        } else if (html.indexOf("SD") !== -1 || html.indexOf("480") !== -1) {
            quality = "480p";
        }

        // 1. Detección en script desempaquetado
        var unpacked = unpackDeanEdwards(html);
        if (unpacked) {
            var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                           unpacked.match(/(?:src|file)\s*:\s*["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                           unpacked.match(/["'](https?:\/\/[a-zA-Z0-9.-]*mp4upload\.com(?::\d+)?\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
            if (srcMatch) {
                return { url: srcMatch[1], quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } };
            }
        }

        // 2. Detección directa en HTML
        var directMatch = html.match(/(?:src|file)\s*:\s*["'](https?:\/\/[a-zA-Z0-9.-]*mp4upload\.com(?::\d+)?\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?)["']/i) ||
                          html.match(/["'](https?:\/\/[a-zA-Z0-9.-]*mp4upload\.com(?::\d+)?\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?)["']/i);
        if (directMatch) {
            return { url: directMatch[1], quality: quality, headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } };
        }

        return null;
    })
    .catch(function() { return null; });
}

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (targetUrl.indexOf("http") !== 0) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");

    return fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var match = html.match(/document\.getElementById\(['"](?:robotlink|ideoolink|noroot)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:\(['"]([^'"]+)['"]\)\.substring\((\d+)\)|['"]([^'"]+)['"])/i);
            if (match) {
                var p2 = (match[2] && match[3]) ? match[2].substring(parseInt(match[3], 10)) : (match[4] || "");
                return { url: "https:" + match[1] + p2, quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveYourUpload(url) {
    var realUrl = url;
    if (realUrl.indexOf("go.php?v=") !== -1) {
        var vPart = realUrl.split("go.php?v=")[1];
        if (vPart) realUrl = decodeURIComponent(vPart);
    }

    return fetch(realUrl, { headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }, redirect: "follow" })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var fileMatch = html.match(/file:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                            html.match(/property=["']og:video["']\s*content=["']([^"']+)["']/i) ||
                            html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i);
            if (fileMatch) {
                return { url: fileMatch[1], quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": realUrl } };
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveUqload(url) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": url }, redirect: "follow" })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var direct = html.match(/sources:\s*\[["'](https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?)["']/i) ||
                         html.match(/sources:\s*\[\{\s*file:\s*["']([^"']+\.mp4[^"']*)["']/i);
            if (direct) {
                return { url: direct[1], quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveMixdrop(url) {
    var embedUrl = url.replace("/f/", "/e/");
    if (embedUrl.indexOf("http") !== 0) embedUrl = "https:" + embedUrl;

    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": embedUrl },
        redirect: "follow"
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        if (!html) return null;
        var directMatch = html.match(/MDCore\.(?:wurl|vurl)\s*=\s*["']([^"']+)["']/i);
        if (directMatch) {
            var vUrl = directMatch[1];
            if (vUrl.indexOf("//") === 0) vUrl = "https:" + vUrl;
            return { url: vUrl, quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } };
        }
        var unpacked = unpackDeanEdwards(html);
        if (unpacked) {
            var match = unpacked.match(/MDCore\.(?:wurl|vurl)\s*=\s*["']([^"']+)["']/i) ||
                        unpacked.match(/["'](https?:\/\/[a-zA-Z0-9.-]+(?:\.delivery\.mxcontent\.net|\.mixdrop)[^"'\s<>]+\.mp4[^"'\s<>]*)["']/i);
            if (match) {
                var finalUrl = match[1];
                if (finalUrl.indexOf("//") === 0) finalUrl = "https:" + finalUrl;
                return { url: finalUrl, quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } };
            }
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(rawUrl) {
    if (!rawUrl) return Promise.resolve(null);
    var u = rawUrl.toLowerCase();

    if (u.indexOf("hgcloud") !== -1 || u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("flaswish") !== -1 || u.indexOf("audinifer") !== -1 || u.indexOf("vibuxer") !== -1) return resolveStreamWish(rawUrl);
    if (u.indexOf("byse") !== -1 || u.indexOf("filemoon") !== -1) return resolveFilemoon(rawUrl);
    if (u.indexOf("vidhide") !== -1 || u.indexOf("filelions") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("callistanise") !== -1) return resolveVidHide(rawUrl);
    if (u.indexOf("mp4upload") !== -1) return resolveMp4upload(rawUrl);
    if (u.indexOf("streamtape") !== -1) return resolveStreamtape(rawUrl);
    if (u.indexOf("yourupload") !== -1 || u.indexOf("nyuu.streamhj") !== -1) return resolveYourUpload(rawUrl);
    if (u.indexOf("uqload") !== -1) return resolveUqload(rawUrl);
    if (u.indexOf("mixdrop") !== -1 || u.indexOf("mxdrop") !== -1 || u.indexOf("miixdrop") !== -1) return resolveMixdrop(rawUrl);

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

function resolveEpisodeMultiplayers(animeItem, sNum, eNum, isMovie) {
    var pageUrls = [];
    var slug = animeItem.slug || "";

    if (isMovie) {
        pageUrls.push(`${BASE_URL}/movie/${slug}`);
        pageUrls.push(`${BASE_URL}/movie/${slug}/`);
        pageUrls.push(`${BASE_URL}/pelicula/${slug}`);
        pageUrls.push(`${BASE_URL}/pelicula/${slug}/`);
        pageUrls.push(`${BASE_URL}/anime/${slug}`);
    } else {
        pageUrls.push(`${BASE_URL}/episode/${slug}-${sNum}x${eNum}/`);
        pageUrls.push(`${BASE_URL}/episode/${slug}-${sNum}x${eNum}`);
        pageUrls.push(`${BASE_URL}/episode/${slug}-${eNum}/`);
        pageUrls.push(`${BASE_URL}/episode/${slug}-${eNum}`);
        pageUrls.push(`${BASE_URL}/episode/${slug}-episodio-${eNum}/`);
        pageUrls.push(`${BASE_URL}/episode/${slug}-temporada-${sNum}-episodio-${eNum}/`);
        pageUrls.push(`${BASE_URL}/ver/${slug}-${sNum}x${eNum}/`);
        pageUrls.push(`${BASE_URL}/ver/${slug}-episodio-${eNum}/`);
        pageUrls.push(`${BASE_URL}/ver/${slug}-${eNum}/`);
        pageUrls.push(`${BASE_URL}/anime/${slug}`);
        pageUrls.push(`${BASE_URL}/anime/${slug}/`);
    }

    function tryNextPage(pIdx) {
        if (pIdx >= pageUrls.length) return Promise.resolve([]);
        var targetPage = pageUrls[pIdx];

        return fetch(targetPage, { headers: DEFAULT_HEADERS, redirect: "follow" })
            .then(function(res) {
                return res.text();
            })
            .then(function(html) {
                if (!html || html.length < 150) return tryNextPage(pIdx + 1);

                var multiplayers = [];

                // 1. Extraer todos los iframes a multiplayer.streamhj.top
                var multiRegex = /https?:\/\/multiplayer\.streamhj\.top\/player\/multiplayer\/embed\.php\?[^"'\s<>]+/gi;
                var mMatch;
                while ((mMatch = multiRegex.exec(html)) !== null) {
                    var fullUrl = mMatch[0].replace(/&amp;/g, "&").replace(/&#038;/g, "&");
                    if (multiplayers.indexOf(fullUrl) === -1) multiplayers.push(fullUrl);
                }

                // 2. Extraer TODOS los idanime presentes (captura pestañas de SUB y CAS/LAT simultáneas)
                var idAnimeGlobalRegex = /(?:idanime=|data-idanime=|idanime\s*:\s*["']?|postid\s*:\s*["']?)(\d+)/gi;
                var idMatch;
                while ((idMatch = idAnimeGlobalRegex.exec(html)) !== null) {
                    var builtUrl = `https://${MULTIPLAYER_HOST}/player/multiplayer/embed.php?idanime=${idMatch[1]}&idcapitulo=${eNum}`;
                    if (multiplayers.indexOf(builtUrl) === -1) multiplayers.push(builtUrl);
                }

                // 3. Fallback en caso de estar en /anime/{slug}
                if (targetPage.indexOf("/anime/") !== -1 && multiplayers.length === 0) {
                    var epLinkRegex = new RegExp('href=["\']([^"\']*(?:episode|ver)\/[^"\']*(?:-' + sNum + 'x' + eNum + '|-' + eNum + '|-episodio-' + eNum + ')[^"\']*)["\']', 'i');
                    var epMatch = html.match(epLinkRegex);
                    if (epMatch && epMatch[1]) {
                        var specificEpUrl = epMatch[1];
                        if (specificEpUrl.indexOf("http") !== 0) {
                            specificEpUrl = BASE_URL + (specificEpUrl.indexOf("/") === 0 ? "" : "/") + specificEpUrl;
                        }
                        return fetch(specificEpUrl, { headers: DEFAULT_HEADERS, redirect: "follow" })
                            .then(function(r) { return r.text(); })
                            .then(function(epHtml) {
                                while ((mMatch = multiRegex.exec(epHtml)) !== null) {
                                    var fUrl = mMatch[0].replace(/&amp;/g, "&").replace(/&#038;/g, "&");
                                    if (multiplayers.indexOf(fUrl) === -1) multiplayers.push(fUrl);
                                }
                                while ((idMatch = idAnimeGlobalRegex.exec(epHtml)) !== null) {
                                    var bUrl = `https://${MULTIPLAYER_HOST}/player/multiplayer/embed.php?idanime=${idMatch[1]}&idcapitulo=${eNum}`;
                                    if (multiplayers.indexOf(bUrl) === -1) multiplayers.push(bUrl);
                                }
                                if (multiplayers.length > 0) return multiplayers;
                                return tryNextPage(pIdx + 1);
                            })
                            .catch(function() { return tryNextPage(pIdx + 1); });
                    }
                }

                if (multiplayers.length > 0) return multiplayers;
                return tryNextPage(pIdx + 1);
            })
            .catch(function() {
                return tryNextPage(pIdx + 1);
            });
    }

    return tryNextPage(0);
}

function extractStreamsFromMultiplayerUrl(playerUrl) {
    return fetch(playerUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": `${BASE_URL}/`,
            "Origin": BASE_URL
        },
        redirect: "follow"
    })
    .then(function(res) {
        return res.text();
    })
    .then(function(html) {
        if (!html || html.length < 50) return [];

        // Detectar idioma a partir del encabezado del reproductor
        var lang = "SUB";
        var titleHeaderMatch = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        var headerText = titleHeaderMatch ? titleHeaderMatch[1].toUpperCase() : html.toUpperCase();

        if (headerText.indexOf("LATINO") !== -1 || headerText.indexOf(" LAT ") !== -1 || headerText.indexOf("- LAT") !== -1) {
            lang = "LAT";
        } else if (headerText.indexOf("CASTELLANO") !== -1 || headerText.indexOf(" CAS ") !== -1 || headerText.indexOf("ESP") !== -1) {
            lang = "CAS";
        } else if (headerText.indexOf("SUB") !== -1 || headerText.indexOf("JAPONES") !== -1) {
            lang = "SUB";
        }

        var serverUrls = [];
        var playRegex = /playVideo\((?:&quot;|["'])(https?:\/\/[^"'\s<>]+?)(?:&quot;|["'])\)/gi;
        var pMatch;
        while ((pMatch = playRegex.exec(html)) !== null) {
            var sUrl = pMatch[1].replace(/&amp;/g, "&").replace(/&#038;/g, "&");
            if (sUrl && serverUrls.indexOf(sUrl) === -1) {
                serverUrls.push(sUrl);
            }
        }

        if (serverUrls.length === 0) return [];

        var resolvePromises = serverUrls.map(function(sUrl) {
            var sName = getServerLabel(sUrl);
            return dispatchResolver(sUrl).then(function(res) {
                if (res && res.url) {
                    return {
                        name: "AnimeJara",
                        title: `${res.quality || "1080p"} · ${lang} · ${sName}`,
                        quality: res.quality || "1080p",
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

                // 2. Ordenar por mayor coincidencia
                scored.sort(function(a, b) {
                    return b.score - a.score;
                });

                function tryNextAnime(aIdx) {
                    if (aIdx >= scored.length) return Promise.resolve([]);
                    var targetAnime = scored[aIdx].anime;

                    return resolveEpisodeMultiplayers(targetAnime, sNum, eNum, isMovie).then(function(multiUrls) {
                        if (!multiUrls || multiUrls.length === 0) {
                            return tryNextAnime(aIdx + 1);
                        }

                        var fetchPromises = multiUrls.map(function(mUrl) {
                            return extractStreamsFromMultiplayerUrl(mUrl);
                        });

                        return Promise.all(fetchPromises).then(function(allResults) {
                            var streams = [];
                            for (var r = 0; r < allResults.length; r++) {
                                if (Array.isArray(allResults[r])) {
                                    streams = streams.concat(allResults[r]);
                                }
                            }

                            var uniqueStreams = streams.filter(function(st, pos, self) {
                                return self.findIndex(function(x) { return x.url === st.url && x.title === st.title; }) === pos;
                            });

                            if (uniqueStreams.length > 0) return uniqueStreams;
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
