/**
 * Provider: JKAnime (Anime Series, Películas, Donghua)
 * Motor: AniList GraphQL + Algoritmo Universal Split-Cour y Continuo
 * Resolvers: Desu (1080p), VidHide, StreamWish (playerwish / hgcloud), Filemoon, Mixdrop, MP4Upload, Streamtape
 * Versión Restaurada y Estable: Basada en la arquitectura del 8 de Noviembre (100% Firestick / NuvioTV Safe)
 * v2.4-TVFIX (2026-11): Adaptativo sin setTimeout. El runtime QuickJS de NuvioTV
 *   (dokar quickjs-kt 1.0.5 + polyfill de PluginRuntime.kt) NO define setTimeout/clearTimeout.
 *   Todo helper que lo usa rechaza al instante y el provider devuelve 0 streams SOLO en TV.
 *   Ahora: si no hay timer (TV), fetch directo con presupuesto global Date.now();
 *   si hay timer (Hermes móvil / PC / Node), se conserva el timeout por llamada.
 *   Marcador de versión: buscar en logcat tag "Plugin:jkanime" el texto [JKAnime][v2.6-diag].
 *   DIAGNOSTICO: esta build escribe TODO por console.error (nivel Error de logcat),
 *   porque NuvioTV/FireOS silencia los mensajes Debug (console.log) en release.
 * v2.5-SLUGFIX (2026-11): Corrige 3 bugs de resolución de slug (fallaba en TODOS los
 *   runtimes para títulos donde AniList devuelve primero OVAs/otra temporada, p. ej.
 *   "We Never Learn" TMDB 87432):
 *   1) resolveUniversalTarget elegía seasonMatches[0] a ciegas -> ahora pickBestAniListMedia
 *      prefiere format TV + título exacto de TMDB y penaliza slugs que solo añaden
 *      sufijo (OVAs) a otro candidato.
 *   2) scoreCandidate ya NO suma +20 por contener el año: jkanime nunca usa años en
 *      slugs y eso hacía que "...-2019" superara al slug correcto. Orden determinista:
 *      slugs planos primero, variantes con año al final.
 *   3) tryBatch admitía solo 2 lotes (6 URLs) y el slug correcto quedaba en el puesto
 *      ~11 y nunca se probaba -> ahora 3 lotes (9 URLs) con guardia de deadline.
 *   Extra: búsqueda nativa por ajax/ajax_search (endpoint oficial del buscador de
 *      jkanime, devuelve slug directo) + regex HTML ampliada (hrefs relativos) + segunda
 *      ronda de búsqueda con el romaji de AniList + penalización de slugs de otra
 *      temporada/OVA + URL canónica sin barra final como primera opción.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var ANILIST_GRAPHQL = "https://graphql.anilist.co";
var BASE_URL = "https://jkanime.net";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS DE RED & STRINGS (HERMES SAFE + NUVIOTV QUICKJS SAFE)
// En NuvioTV (QuickJS) NO existe setTimeout: OkHttp ya corta cada petición
// (30s connect / 30s read) y el runtime mata el plugin a los 60s.
// ==========================================

var HAS_TIMER = (typeof setTimeout === "function");
var GLOBAL_BUDGET_MS = 45000;
var START_TS = 0;

function tvNow() {
    try { return Date.now(); } catch (e2) { return 0; }
}

function tvElapsed() {
    if (!START_TS) return 0;
    return tvNow() - START_TS;
}

function tvRemaining() {
    var left = GLOBAL_BUDGET_MS - tvElapsed();
    return (left > 0) ? left : 0;
}

function textWithTimeout(res, timeoutMs) {
    if (!res || typeof res.text !== "function") return Promise.resolve(null);
    if (!HAS_TIMER) {
        try {
            return res.text().then(function(t) { return t; }).catch(function() { return null; });
        } catch (e3) {
            return Promise.resolve(null);
        }
    }
    var limit = timeoutMs || 3000;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.text().then(function(t) {
                if (!done) { done = true; clearTimeout(timer); resolve(t); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
    });
}

function jsonWithTimeout(res, timeoutMs) {
    if (!res || typeof res.json !== "function") return Promise.resolve(null);
    if (!HAS_TIMER) {
        try {
            return res.json().then(function(j) { return j; }).catch(function() { return null; });
        } catch (e4) {
            return Promise.resolve(null);
        }
    }
    var limit = timeoutMs || 3000;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.json().then(function(j) {
                if (!done) { done = true; clearTimeout(timer); resolve(j); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
    });
}

function fetchWithTimeout(url, options, timeoutMs) {
    if (tvRemaining() < 400) return Promise.resolve(null);

    if (!HAS_TIMER) {
        // NuvioTV: sin timer JS posible. OkHttp (30s/30s) es el límite real.
        try {
            return fetch(url, options || {})
                .then(function(res) { return res; })
                .catch(function() { return null; });
        } catch (e5) {
            return Promise.resolve(null);
        }
    }

    var limit = timeoutMs || NETWORK_TIMEOUT;
    if (limit > tvRemaining()) limit = tvRemaining();
    var timer = null;

    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error("Timeout"));
        }, limit);
    });

    return Promise.race([fetch(url, options || {}), timeoutPromise])
        .then(function(res) {
            if (timer) clearTimeout(timer);
            return res;
        })
        .catch(function() {
            if (timer) clearTimeout(timer);
            return null;
        });
}

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
    var normalized = text;
    try {
        normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}

    return normalized
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
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

function getSeasonRank(text) {
    if (!text) return 1;
    // Sufijo numérico de temporada al final del slug/título: "...-ga-dekinai-2" = S2
    // (jkanime numera secuelas así). Solo 2-9 para no confundir con años ("...-2019").
    var tail = text.toLowerCase().match(/-([0-9]+)$/);
    if (tail) {
        var tailNum = parseInt(tail[1], 10);
        if (tailNum >= 2 && tailNum <= 9) return tailNum;
    }
    var t = (" " + text.toLowerCase() + " ").replace(/[:\-_]/g, " ");
    if (t.indexOf(" season 4 ") !== -1 || t.indexOf(" 4th season ") !== -1 || t.indexOf(" iv ") !== -1 || t.indexOf(" final season ") !== -1) return 4;
    if (t.indexOf(" season 3 ") !== -1 || t.indexOf(" 3rd season ") !== -1 || t.indexOf(" iii ") !== -1) return 3;
    if (t.indexOf(" season 2 ") !== -1 || t.indexOf(" 2nd season ") !== -1 || t.indexOf(" ii ") !== -1) return 2;
    return 1;
}

function isPartTwo(text) {
    if (!text) return false;
    var t = text.toLowerCase();
    return t.indexOf("part 2") !== -1 || t.indexOf("part-2") !== -1 || t.indexOf("cour 2") !== -1 || t.indexOf("cour-2") !== -1;
}

function isSeasonalSlug(slug) {
    if (!slug) return false;
    var s = "-" + slug.toLowerCase() + "-";
    var markers = [
        "-season-", "-temporada-", "-part-", "-cour-",
        "-1st-", "-2nd-", "-3rd-", "-4th-", "-5th-", "-6th-",
        "-s1-", "-s2-", "-s3-", "-s4-", "-s5-",
        "-ii-", "-iii-", "-iv-", "-v-",
        "-movie-", "-pelicula-"
    ];
    for (var i = 0; i < markers.length; i++) {
        if (s.indexOf(markers[i]) !== -1) return true;
    }
    return false;
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

    // v2.5: se elimina el bonus +20 por año en el slug. jkanime no usa años en sus
    // slugs y el bonus ponía "slug-2019" por ENCIMA del slug correcto.
    return score;
}

// ==========================================
// 2. DESEMPAQUETADOR Y DETECCIÓN DE CALIDAD
// ==========================================

function unpackFromHtml(html) {
    if (!html) return "";
    var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
    if (!packMatch) {
        packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\('\|'\)/);
    }
    if (!packMatch) return "";

    var p = packMatch[1];
    var a = parseInt(packMatch[2], 10);
    var c = parseInt(packMatch[3], 10);
    var k = packMatch[4].split("|");

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

function detectQualityFromUrl(url) {
    if (!url) return null;
    var clean = url.split("?")[0].toLowerCase();

    if (clean.indexOf(".urlset") !== -1) {
        var urlsetMatch = clean.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            // Mapa por familia (Regla 7): VidHide/StreamWish/Filemoon h=1080, n=720, l=480
            var isVswFamily = clean.indexOf("vidhide") !== -1 || clean.indexOf("minochinos") !== -1 || clean.indexOf("morencius") !== -1 || clean.indexOf("callistanise") !== -1 || clean.indexOf("streamwish") !== -1 || clean.indexOf("hlswish") !== -1 || clean.indexOf("flaswish") !== -1 || clean.indexOf("playerwish") !== -1 || clean.indexOf("hglink") !== -1 || clean.indexOf("filemoon") !== -1;
            if (isVswFamily) {
                if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("h") !== -1) return "1080p";
                if (tags.indexOf("n") !== -1) return "720p";
                if (tags.indexOf("l") !== -1) return "480p";
            }
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("fhd") !== -1) return "1080p";
            if (tags.indexOf("h") !== -1 || tags.indexOf("hd") !== -1) return "720p";
            if (tags.indexOf("n") !== -1 || tags.indexOf("sd") !== -1) return "480p";
            if (tags.indexOf("l") !== -1) return "360p";
        }
    }

    if (/(?:[-_./]|^)(?:4k|2160p?)(?:[-_./]|$)/i.test(clean)) return "4K";
    if (/(?:[-_./]|^)(?:1080p?|fhd)(?:[-_./]|$)/i.test(clean)) return "1080p";
    if (/(?:[-_./]|^)(?:720p?)(?:[-_./]|$)/i.test(clean)) return "720p";
    if (/(?:[-_./]|^)(?:480p?)(?:[-_./]|$)/i.test(clean)) return "480p";

    return null;
}

function probeM3u8Quality(m3u8Url, headers, defaultQuality) {
    var fallback = defaultQuality || "720p";
    var fastQ = detectQualityFromUrl(m3u8Url);
    if (fastQ) return Promise.resolve(fastQ);

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve(fallback);

    return fetchWithTimeout(m3u8Url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" }, 2500)
        .then(function(res) {
            if (!res || !res.ok) return fallback;
            return textWithTimeout(res, 3000);
        })
        .then(function(text) {
            if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
                if (m3u8Url.indexOf("1080") !== -1) return "1080p";
                if (m3u8Url.indexOf("720") !== -1) return "720p";
                return fallback;
            }

            var maxW = 0, maxH = 0;
            var resRegex = /RESOLUTION=(\d+)x(\d+)/gi;
            var match;
            while ((match = resRegex.exec(text)) !== null) {
                var w = parseInt(match[1], 10);
                var h = parseInt(match[2], 10);
                if (w > maxW) maxW = w;
                if (h > maxH) maxH = h;
            }

            if (maxW >= 3840 || maxH >= 2160) return "4K";
            if (maxW >= 1920 || maxH >= 1080) return "1080p";
            if (maxW >= 1280 || maxH >= 720) return "720p";
            if (maxW >= 854 || maxH >= 480) return "480p";
            return fallback;
        })
        .catch(function() { return fallback; });
}

// ==========================================
// 3. MATEMÁTICAS UNIVERSALES DE EPISODIOS
// ==========================================

function calculateAbsoluteEp(seasons, sNum, eNum) {
    if (!seasons || seasons.length === 0 || sNum <= 1) return eNum;
    var totalPrevious = 0;
    for (var i = 0; i < seasons.length; i++) {
        var s = seasons[i];
        if (s.season_number > 0 && s.season_number < sNum) {
            totalPrevious += (s.episode_count || 0);
        }
    }
    return totalPrevious + eNum;
}

function decomposeAbsoluteEp(seasons, absEp) {
    if (!seasons || seasons.length === 0) return { season: 1, episode: absEp };
    var accumulated = 0;
    for (var i = 0; i < seasons.length; i++) {
        var s = seasons[i];
        if (s.season_number > 0) {
            var count = s.episode_count || 0;
            if (accumulated + count >= absEp) {
                return {
                    season: s.season_number,
                    episode: absEp - accumulated
                };
            }
            accumulated += count;
        }
    }
    return { season: 1, episode: absEp };
}

// ==========================================
// 4. ANILIST GRAPHQL
// ==========================================

function fetchAniListMapping(searchName) {
    if (!searchName || hasAsianChars(searchName)) return Promise.resolve([]);

    var gqlQuery = "query ($search: String) { Page(page: 1, perPage: 10) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { romaji english } synonyms episodes seasonYear format } } }";

    return fetchWithTimeout(ANILIST_GRAPHQL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ query: gqlQuery, variables: { search: searchName } })
    }, 2800)
    .then(function(res) { return res ? jsonWithTimeout(res, 3000) : null; })
    .then(function(json) {
        return (json && json.data && json.data.Page && json.data.Page.media) || [];
    })
    .catch(function() { return []; });
}

function pickBestAniListMedia(list, titles) {
    if (!list || list.length === 0) return null;
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var romaji = (item.title && item.title.romaji) || "";
        var slug = cleanTitle(romaji);
        if (!slug) continue;

        var sc = scoreCandidate(slug, titles, null);

        // La serie principal de una temporada suele ser format TV; OVAs/especiales no.
        if (item.format === "TV") sc += 25;
        if (item.format === "MOVIE") sc -= 10;

        // Coincidencia EXACTA contra algún título de TMDB
        for (var t = 0; t < titles.length; t++) {
            var ct = cleanTitle(titles[t]);
            if (ct && ct === slug) { sc += 15; break; }
        }

        // Penaliza entradas que solo AÑADEN sufijo a otra ("...OVAs" vs la serie base)
        for (var j = 0; j < list.length; j++) {
            if (j === i) continue;
            var otherSlug = cleanTitle((list[j].title && list[j].title.romaji) || "");
            if (otherSlug && slug.indexOf(otherSlug) === 0 && slug.length > otherSlug.length) {
                sc -= 20;
            }
        }

        if (sc > bestScore) {
            bestScore = sc;
            best = item;
        }
    }
    return best || list[0];
}

function resolveUniversalTarget(aniListMedia, sNum, eNum, absoluteEp, titles) {
    if (!aniListMedia || aniListMedia.length === 0) return null;

    var seasonMatches = [];
    for (var i = 0; i < aniListMedia.length; i++) {
        var item = aniListMedia[i];
        var combinedTitle = (item.title.romaji || "") + " " + (item.title.english || "");
        var rank = getSeasonRank(combinedTitle);
        if (rank === sNum) {
            seasonMatches.push(item);
        }
    }

    if (seasonMatches.length === 0) {
        // v2.5: ya no se toma aniListMedia[0] a ciegas (podía ser la entry de OVAs)
        var baseEntry = pickBestAniListMedia(aniListMedia, titles);
        return {
            slug: cleanTitle(baseEntry.title.romaji),
            targetEp: sNum > 1 ? absoluteEp : eNum,
            isContinuous: true
        };
    }

    if (seasonMatches.length > 1) {
        var part1 = null;
        var part2 = null;

        for (var p = 0; p < seasonMatches.length; p++) {
            var name = (seasonMatches[p].title.romaji + " " + seasonMatches[p].title.english).toLowerCase();
            if (isPartTwo(name)) {
                part2 = seasonMatches[p];
            } else {
                part1 = seasonMatches[p];
            }
        }

        if (part1 && part2) {
            var p1Limit = part1.episodes || 12;
            if (eNum > p1Limit) {
                return {
                    slug: cleanTitle(part2.title.romaji),
                    targetEp: eNum - p1Limit,
                    isContinuous: false
                };
            } else {
                return {
                    slug: cleanTitle(part1.title.romaji),
                    targetEp: eNum,
                    isContinuous: false
                };
            }
        }
    }

    // v2.5: entre los matches del mismo rank, elegir la MEJOR entry (TV + título exacto)
    var selected = pickBestAniListMedia(seasonMatches, titles);
    return {
        slug: cleanTitle(selected.title.romaji),
        targetEp: eNum,
        isContinuous: false
    };
}

function searchJKAnime(query) {
    if (!query || hasAsianChars(query)) return Promise.resolve([]);

    var apiSlugs = [];
    var htmlSlugs = [];

    // Fuente 1 (v2.5): endpoint AJAX oficial del buscador de jkanime, devuelve el slug
    // directo en JSON ({animes: [{id, slug, title, ...}]}).
    var apiUrl = BASE_URL + "/ajax/ajax_search/?q=" + encodeURIComponent(query);

    // Fuente 2: HTML clásico de /buscar/ con regex ampliada: acepta hrefs absolutos
    // (https://jkanime.net/slug/) Y relativos (/slug/), con o sin barra final.
    var searchUrl = BASE_URL + "/buscar/" + encodeURIComponent(query) + "/";

    var blockedSlugs = ["buscar", "horario", "directorio", "jkplayer", "emision", "top",
        "anime", "letras", "contacto", "dmca", "perfil", "login", "registro", "faq",
        "wp-content", "wp-admin", "wp-includes", "proximo", "mitop"];

    return Promise.all([
        fetchWithTimeout(apiUrl, { headers: DEFAULT_HEADERS }, 2500)
            .then(function(res) {
                if (!res || !res.ok) { console.error("[JKAnime][v2.6-diag] search API HTTP " + (res ? res.status : "null") + " q='" + query + "'"); return null; }
                return jsonWithTimeout(res, 2500);
            })
            .then(function(json) {
                if (!json) return;
                var arr = (json && json.animes) || ((typeof json === "object" && json && json.length !== undefined && json.length !== null && Array.isArray(json)) ? json : null);
                if (!arr || !arr.length) return;
                for (var i = 0; i < arr.length && i < 12; i++) {
                    var it = arr[i];
                    if (!it) continue;
                    var cand = it.slug || it.anime_slug || "";
                    if (cand && cand.indexOf("http") === 0) cand = cleanSlug(cand);
                    if (cand && !hasAsianChars(cand) && apiSlugs.indexOf(cand) === -1) {
                        apiSlugs.push(cand);
                    }
                }
            })
            .catch(function() {}),
        fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2500)
            .then(function(res) {
                if (!res || !res.ok) { console.error("[JKAnime][v2.6-diag] search HTML HTTP " + (res ? res.status : "null") + " q='" + query + "'"); return ""; }
                return textWithTimeout(res, 2500);
            })
            .then(function(html) {
                if (!html) return;
                var regex = /href=["'](?:https?:\/\/jkanime\.net)?\/([a-zA-Z0-9-]+)\/?["']/gi;
                var match;

                while ((match = regex.exec(html)) !== null) {
                    var s = match[1];
                    if (s && blockedSlugs.indexOf(s) === -1 && htmlSlugs.indexOf(s) === -1) {
                        htmlSlugs.push(s);
                    }
                }
            })
            .catch(function() {})
    ]).then(function() {
        var out = apiSlugs.slice();
        for (var i = 0; i < htmlSlugs.length; i++) {
            if (out.indexOf(htmlSlugs[i]) === -1) out.push(htmlSlugs[i]);
        }
        console.error("[JKAnime][v2.6-diag] search '" + query + "': api=" + apiSlugs.length + " html=" + htmlSlugs.length + " total=" + out.length);
        return out;
    });
}

// ==========================================
// 5. RESOLVERS DE STREAMING ROBUSTOS
// ==========================================

function resolveStreamWish(url) {
    var targetUrl = url;
    // Soporte seguro de mirrors activos para StreamWish
    if (targetUrl.indexOf("hlswish.com") !== -1 || targetUrl.indexOf("hglink.to") !== -1 || targetUrl.indexOf("flaswish.com") !== -1) {
        var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://playerwish.com/e/" + idMatch[1];
    } else if (targetUrl.indexOf("/f/") !== -1 || targetUrl.indexOf("/v/") !== -1) {
        targetUrl = targetUrl.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": targetUrl },
        redirect: "follow"
    }, 2800)
    .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
    .then(function(html) {
        var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (direct) {
            return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                return { url: direct[1], serverName: "StreamWish", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            });
        }

        var unpacked = unpackFromHtml(html);
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

function resolveFilemoon(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": url }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
        .then(function(html) {
            var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) {
                return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": url }, "1080p").then(function(q) {
                    return { url: direct[1], serverName: "Filemoon", quality: q || "1080p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) {
                    return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": url }, "1080p").then(function(q) {
                        return { url: m3u8[0], serverName: "Filemoon", quality: q || "1080p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                    });
                }
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveMixdrop(url) {
    var embedUrl = url.replace("/f/", "/e/");
    if (embedUrl.indexOf("http") !== 0) embedUrl = "https:" + embedUrl;

    return fetchWithTimeout(embedUrl, { headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
        .then(function(html) {
            if (!html) return null;
            var directMatch = html.match(/MDCore\.(?:wurl|vurl)\s*=\s*["']([^"']+)["']/i);
            if (directMatch) {
                var vUrl = directMatch[1];
                if (vUrl.indexOf("//") === 0) vUrl = "https:" + vUrl;
                return { url: vUrl, serverName: "Mixdrop", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } };
            }
            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var match = unpacked.match(/MDCore\.(?:wurl|vurl)\s*=\s*["']([^"']+)["']/i) ||
                            unpacked.match(/["'](https?:\/\/[a-zA-Z0-9.-]+(?:\.delivery\.mxcontent\.net|\.mixdrop)[^"'\s<>]+\.mp4[^"'\s<>]*)["']/i);
                if (match) {
                    var finalUrl = match[1];
                    if (finalUrl.indexOf("//") === 0) finalUrl = "https:" + finalUrl;
                    return { url: finalUrl, serverName: "Mixdrop", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": embedUrl } };
                }
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveVidHide(url) {
    var hostMatch = url.match(/^(https?:\/\/[^/]+)/i);
    var host = hostMatch ? hostMatch[1] : "https://callistanise.com";

    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }, redirect: "follow" }, 2800)
        .then(function(res) {
            if (!res) return null;
            var finalUrl = res.url || url;
            return textWithTimeout(res, 3000).then(function(html) {
                var streamUrl = null;
                var unpacked = unpackFromHtml(html);
                if (unpacked) {
                    var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) || unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
                    if (m3u8Match) streamUrl = m3u8Match[1] || m3u8Match[0];
                }

                if (!streamUrl) {
                    var directMatch = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)["']/i);
                    if (directMatch) streamUrl = directMatch[1];
                }

                if (streamUrl) {
                    if (streamUrl.indexOf("/") === 0) streamUrl = host + streamUrl;
                    return probeM3u8Quality(streamUrl, { "User-Agent": USER_AGENT, "Referer": finalUrl }).then(function(q) {
                        return { url: streamUrl, serverName: "VidHide", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": finalUrl } };
                    });
                }
                return null;
            });
        }).catch(function() { return null; });
}

function resolveMp4upload(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://www.mp4upload.com/" }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
        .then(function(html) {
            if (!html) return null;

            var unpacked = unpackFromHtml(html);
            if (unpacked) {
                var srcMatch = unpacked.match(/player\.src\(\s*\{[^{}]*src:\s*["']([^"']+\.mp4(?:\?[^"'\s\\]*)?)["']/i) ||
                               unpacked.match(/(?:src|file)\s*:\s*["'](https?:\/\/[^"'\s\\]+\.mp4(?:\?[^"'\s\\]*)?)["']/i);
                if (srcMatch) return { url: srcMatch[1], serverName: "MP4Upload", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
            }
            var directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
            if (directMatch) return { url: directMatch[0], serverName: "MP4Upload", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
            return null;
        })
        .catch(function() { return null; });
}

function resolveStreamtape(url) {
    var targetUrl = url.replace("/v/", "/e/");
    if (targetUrl.indexOf("http") !== 0) targetUrl = "https://" + targetUrl.replace(/^\/\//, "");

    return fetchWithTimeout(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" }, 2500)
        .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
        .then(function(html) {
            var match = html.match(/document\.getElementById\(['"](?:robotlink|ideoolink|noroot)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:\(['"]([^'"]+)['"]\)\.substring\((\d+)\)|['"]([^'"]+)['"])/i);
            if (match) {
                var p2 = (match[2] && match[3]) ? match[2].substring(parseInt(match[3], 10)) : (match[4] || "");
                var full = match[1] + p2;
                if (full.indexOf("//") === 0) full = "https:" + full;
                return { url: full, serverName: "Streamtape", quality: "720p", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveDesuMagi(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
        .then(function(html) {
            var m3u8Match = html.match(/https?:\/\/[^"'\s\\]+playmudos\.com\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i) ||
                            html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
            if (m3u8Match) {
                return probeM3u8Quality(m3u8Match[0], { "User-Agent": USER_AGENT, "Referer": url }, "1080p").then(function(q) {
                    return { url: m3u8Match[0], serverName: "Desu", quality: q || "1080p", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
            return null;
        }).catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("hgcloud") !== -1 || u.indexOf("flaswish") !== -1 || u.indexOf("playerwish") !== -1) return resolveStreamWish(url);
    // Byse exige fingerprint de navegador + PoW captcha: filtrar ANTES de gastar peticiones
    if (u.indexOf("byse") !== -1 || u.indexOf("bysekoze") !== -1) return Promise.resolve(null);
    if (u.indexOf("filemoon") !== -1) return resolveFilemoon(url);
    if (u.indexOf("mixdrop") !== -1 || u.indexOf("mxdrop") !== -1) return resolveMixdrop(url);
    if (u.indexOf("vidhide") !== -1 || u.indexOf("morencius") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("callistanise") !== -1) return resolveVidHide(url);
    if (u.indexOf("mp4upload") !== -1) return resolveMp4upload(url);
    if (u.indexOf("streamtape") !== -1) return resolveStreamtape(url);
    if (u.indexOf("/jkplayer/") !== -1 || u.indexOf("playmudos") !== -1) return resolveDesuMagi(url);
    return Promise.resolve(null);
}

function extractStreamsFromEpisodePage(pageUrl) {
    return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, 2800)
        .then(function(res) {
            if (!res || !res.ok) { console.error("[JKAnime][v2.6-diag] pagina HTTP " + (res ? res.status : "null") + " url=" + pageUrl); return ""; }
            return textWithTimeout(res, 3000);
        })
        .then(function(html) {
            var rawEmbeds = [];

            var serversMatch = html.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
            if (serversMatch) {
                try {
                    var sArr = JSON.parse(serversMatch[1]);
                    for (var i = 0; i < sArr.length; i++) {
                        if (sArr[i] && sArr[i].remote) {
                            var dec = decodeBase64Safe(sArr[i].remote);
                            if (dec && dec.indexOf("http") === 0) rawEmbeds.push(dec);
                        }
                    }
                } catch (e) {}
            }

            var b64Tokens = html.match(/aHR0cHM6[a-zA-Z0-9+/=_-]+/gi) || [];
            for (var j = 0; j < b64Tokens.length; j++) {
                var d = decodeBase64Safe(b64Tokens[j]);
                if (d && d.indexOf("http") === 0) rawEmbeds.push(d);
            }

            var umRegex = /https?:\/\/jkanime\.net\/jkplayer\/(?:um|umv|uk)[^\s"'<>]+/gi, umMatch;
            while ((umMatch = umRegex.exec(html)) !== null) {
                rawEmbeds.push(umMatch[0].replace(/&amp;/g, "&"));
            }

            var uniqueEmbeds = [];
            for (var u = 0; u < rawEmbeds.length; u++) {
                if (uniqueEmbeds.indexOf(rawEmbeds[u]) === -1) {
                    uniqueEmbeds.push(rawEmbeds[u]);
                }
            }

            if (uniqueEmbeds.length === 0) {
                if (html.length > 0) console.error("[JKAnime][v2.6-diag] pagina 200 sin embeds (html=" + html.length + " chars) url=" + pageUrl);
                return [];
            }

            var promises = uniqueEmbeds.map(function(embedUrl) {
                return dispatchResolver(embedUrl)
                    .then(function(res) {
                        if (!res || !res.url) return null;
                        var q = res.quality || "720p";
                        return {
                            name: "JKAnime",
                            title: q + " · SUB · " + res.serverName,
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
            var valid = [];
            for (var i = 0; i < results.length; i++) {
                if (results[i]) valid.push(results[i]);
            }
            return valid;
        })
        .catch(function() { return []; });
}

// ==========================================
// 6. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    START_TS = tvNow();
    var mt = String(mediaType || "").toLowerCase();
    var isMovie = (mt === "movie" || mt === "pelicula");
    console.error("[JKAnime][v2.6-diag] getStreams tmdbId=" + tmdbId + " type=" + mt + " s=" + season + " e=" + episode + " timer=" + HAS_TIMER);
    var sParsed = parseInt(season, 10);
    var sNum = isNaN(sParsed) ? 1 : sParsed;
    var eNum = isMovie ? 1 : (parseInt(episode, 10) || 1);
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, null, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB HTTP Error");
            return jsonWithTimeout(res, 3000);
        })
        .then(function(meta) {
            if (!meta) return [];
            var isAnimation = false;
            if (meta.genres && Array.isArray(meta.genres)) {
                for (var g = 0; g < meta.genres.length; g++) {
                    if (meta.genres[g].id === 16) {
                        isAnimation = true;
                        break;
                    }
                }
            }
            if (!isAnimation) {
                console.error("[JKAnime][v2.6-diag] TMDB sin genero 16 (animation). Se devuelve vacio.");
                return [];
            }

            var origLang = meta.original_language || "";
            var isAsianAnim = (origLang === "ja" || origLang === "zh" || origLang === "ko");
            if (!isAsianAnim && meta.origin_country) {
                for (var c = 0; c < meta.origin_country.length; c++) {
                    var co = meta.origin_country[c];
                    if (co === "JP" || co === "CN" || co === "KR" || co === "TW" || co === "HK") {
                        isAsianAnim = true;
                        break;
                    }
                }
            }
            if (!isAsianAnim) {
                console.error("[JKAnime][v2.6-diag] TMDB sin origen asiatico (lang=" + origLang + "). Se devuelve vacio.");
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

            var cleanSearchTitle = "";
            if (origTitle && !hasAsianChars(origTitle)) {
                cleanSearchTitle = origTitle;
            } else if (title && !hasAsianChars(title)) {
                cleanSearchTitle = title;
            } else {
                for (var a = 0; a < altArr.length; a++) {
                    if (altArr[a].title && !hasAsianChars(altArr[a].title)) {
                        cleanSearchTitle = altArr[a].title;
                        break;
                    }
                }
            }
            if (!cleanSearchTitle) cleanSearchTitle = title || origTitle || "";

            var cleanT = cleanTitle(cleanSearchTitle).replace(/-/g, " ");
            var words = cleanT.split(/\s+/).filter(function(w) { return w.length > 2; });
            var searchKeyword = words.length >= 2 ? words.slice(0, 2).join(" ") : cleanT;

            var seasonsList = meta.seasons || [];
            var s1Count = 60;
            for (var sIdx = 0; sIdx < seasonsList.length; sIdx++) {
                if (seasonsList[sIdx].season_number === 1) {
                    s1Count = seasonsList[sIdx].episode_count || 60;
                    break;
                }
            }

            var effectiveSeason = sNum;
            var effectiveEpisode = eNum;
            var absoluteEp = eNum;

            if (!isMovie) {
                if (sNum === 1 && eNum > s1Count && seasonsList.length > 1) {
                    absoluteEp = eNum;
                    var decomp = decomposeAbsoluteEp(seasonsList, eNum);
                    effectiveSeason = decomp.season;
                    effectiveEpisode = decomp.episode;
                } else {
                    absoluteEp = calculateAbsoluteEp(seasonsList, sNum, eNum);
                    effectiveSeason = sNum;
                    effectiveEpisode = eNum;
                }
            }

            console.error("[JKAnime][v2.6-diag] TMDB ok: s1Count=" + s1Count + " effS=" + effectiveSeason + " effE=" + effectiveEpisode + " abs=" + absoluteEp + " keyword='" + searchKeyword + "'");

            return Promise.all([
                fetchAniListMapping(searchKeyword),
                searchJKAnime(searchKeyword)
            ]).then(function(results) {
                var aniListMedia = results[0];
                var nativeSlugs0 = results[1];

                // v2.5: segunda ronda de búsqueda nativa. Si el keyword TMDB (p. ej.
                // "never learn") no produjo slugs, se reintenta con el romaji de AniList
                // ("bokutachi wa benkyou ga dekinai"), que es lo que jkanime indexa.
                var keyMedia = (aniListMedia && aniListMedia.length > 0) ? aniListMedia[0] : null;
                if (keyMedia) {
                    for (var rl = 0; rl < aniListMedia.length; rl++) {
                        if (aniListMedia[rl] && aniListMedia[rl].format === "TV") { keyMedia = aniListMedia[rl]; break; }
                    }
                }
                var romajiKey = (keyMedia && keyMedia.title) ? cleanTitle(keyMedia.title.romaji || "").replace(/-/g, " ") : "";
                var secondRound;
                if (nativeSlugs0 && nativeSlugs0.length > 0) {
                    secondRound = Promise.resolve(nativeSlugs0);
                } else if (romajiKey) {
                    secondRound = searchJKAnime(romajiKey);
                } else {
                    secondRound = Promise.resolve([]);
                }

                return secondRound.then(function(nativeSlugs) {

                var aniTarget = resolveUniversalTarget(aniListMedia, effectiveSeason, effectiveEpisode, absoluteEp, titles);
                console.error("[JKAnime][v2.6-diag] AniList=" + (aniListMedia ? aniListMedia.length : 0) + " items, nativos=" + nativeSlugs.length + ", target=" + (aniTarget && aniTarget.slug ? aniTarget.slug + " ep=" + aniTarget.targetEp : "NINGUNO"));
                var candidateSlugs = [];

                if (aniTarget && aniTarget.slug) {
                    candidateSlugs.push({
                        slug: aniTarget.slug,
                        targetEp: aniTarget.targetEp,
                        isContinuous: aniTarget.isContinuous,
                        isYearVariant: false
                    });
                    if (year) {
                        candidateSlugs.push({
                            slug: aniTarget.slug + "-" + year,
                            targetEp: aniTarget.targetEp,
                            isContinuous: aniTarget.isContinuous,
                            isYearVariant: true
                        });
                    }
                }

                for (var n = 0; n < nativeSlugs.length; n++) {
                    var nSlug = nativeSlugs[n];
                    var exists = false;
                    for (var ex = 0; ex < candidateSlugs.length; ex++) {
                        if (candidateSlugs[ex].slug === nSlug) { exists = true; break; }
                    }
                    if (!exists) candidateSlugs.push({ slug: nSlug, targetEp: null, isContinuous: false, isYearVariant: false });
                }

                for (var t = 0; t < titles.length; t++) {
                    var sBase = cleanTitle(titles[t]);
                    if (sBase) {
                        var ex1 = false;
                        for (var e1 = 0; e1 < candidateSlugs.length; e1++) {
                            if (candidateSlugs[e1].slug === sBase) { ex1 = true; break; }
                        }
                        if (!ex1) candidateSlugs.push({ slug: sBase, targetEp: null, isContinuous: false, isYearVariant: false });

                        if (year) {
                            var sYear = sBase + "-" + year;
                            var ex2 = false;
                            for (var e2 = 0; e2 < candidateSlugs.length; e2++) {
                                if (candidateSlugs[e2].slug === sYear) { ex2 = true; break; }
                            }
                            if (!ex2) candidateSlugs.push({ slug: sYear, targetEp: null, isContinuous: false, isYearVariant: true });
                        }
                    }
                }

                var scoredSlugs = [];
                for (var k = 0; k < candidateSlugs.length; k++) {
                    var cand = candidateSlugs[k];
                    var sc = scoreCandidate(cand.slug, titles, null);
                    if (sc >= 35) {
                        var slugRank = getSeasonRank(cand.slug);
                        if (slugRank === effectiveSeason) {
                            sc += 30;
                            if (isPartTwo(cand.slug) && effectiveEpisode > 12) sc += 15;
                            if (!isPartTwo(cand.slug) && effectiveEpisode <= 12) sc += 15;
                        } else if (effectiveSeason > 1 && slugRank === 1 && !cand.isContinuous) {
                            sc -= 30;
                        } else if (effectiveSeason === 1 && slugRank > 1) {
                            // v2.5: pidieron S1 pero el slug es de otra temporada ("...-2")
                            sc -= 30;
                        }
                        // v2.5: OVAs/especiales/pelis no sirven para una temporada regular
                        if (!isMovie && effectiveSeason === 1) {
                            var lowSlug = "-" + cand.slug.toLowerCase() + "-";
                            if (lowSlug.indexOf("-ova-") !== -1 || lowSlug.indexOf("-ovas-") !== -1 ||
                                lowSlug.indexOf("-especial-") !== -1 || lowSlug.indexOf("-movie-") !== -1 ||
                                lowSlug.indexOf("-pelicula-") !== -1) {
                                sc -= 40;
                            }
                        }
                        scoredSlugs.push({ slug: cand.slug, score: sc, targetEp: cand.targetEp, isContinuous: cand.isContinuous, isYearVariant: cand.isYearVariant, ord: k });
                    }
                }

                if (scoredSlugs.length === 0) {
                    console.error("[JKAnime][v2.6-diag] SIN slugs con score >= 35 de " + candidateSlugs.length + " candidatos");
                    return [];
                }

                // v2.5: orden determinista. Los slugs planos SIEMPRE antes que las
                // variantes con año (en QuickJS la estabilidad de sort no está garantizada,
                // por eso se desempata con el índice de inserción).
                scoredSlugs.sort(function(a, b) {
                    if (a.isYearVariant !== b.isYearVariant) return a.isYearVariant ? 1 : -1;
                    if (b.score !== a.score) return b.score - a.score;
                    return a.ord - b.ord;
                });

                var diagTop = [];
                for (var dt = 0; dt < scoredSlugs.length && dt < 5; dt++) diagTop.push(scoredSlugs[dt].slug + ":" + scoredSlugs[dt].score);
                console.error("[JKAnime][v2.6-diag] top slugs: " + (diagTop.length ? diagTop.join(" | ") : "NINGUNO"));

                var pageUrlsToTry = [];
                for (var sIdx = 0; sIdx < scoredSlugs.length; sIdx++) {
                    var item = scoredSlugs[sIdx];
                    var curSlug = item.slug;

                    if (isMovie) {
                        pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/pelicula/");
                        pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/1/");
                        continue;
                    }

                    var isSeasonal = isSeasonalSlug(curSlug);
                    var epsToTry = [];

                    if (item.targetEp) {
                        epsToTry.push(item.targetEp);
                    }

                    if (isSeasonal) {
                        var seasonalEp = (isPartTwo(curSlug) && effectiveEpisode > 12) ? (effectiveEpisode - 12) : effectiveEpisode;
                        epsToTry.push(seasonalEp);
                        if (absoluteEp !== seasonalEp) epsToTry.push(absoluteEp);
                    } else {
                        if (effectiveSeason > 1 || absoluteEp > s1Count) {
                            epsToTry.push(absoluteEp);
                            if (effectiveEpisode !== absoluteEp) epsToTry.push(effectiveEpisode);
                        } else {
                            epsToTry.push(effectiveEpisode);
                        }
                    }

                    for (var epI = 0; epI < epsToTry.length; epI++) {
                        var epVal = epsToTry[epI];
                        // Formato canónico actual de jkanime: /slug/ep (sin barra final)
                        pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + epVal);
                        // Variante con barra final (seguía funcionando en móvil) para los
                        // 2 slugs de mayor confianza
                        if (sIdx < 2) {
                            pageUrlsToTry.push(BASE_URL + "/" + curSlug + "/" + epVal + "/");
                        }
                    }
                }

                var uniquePageUrls = [];
                for (var u = 0; u < pageUrlsToTry.length; u++) {
                    if (uniquePageUrls.indexOf(pageUrlsToTry[u]) === -1) {
                        uniquePageUrls.push(pageUrlsToTry[u]);
                    }
                }

                console.error("[JKAnime][v2.6-diag] intentando " + uniquePageUrls.length + " paginas. primeras: " + (uniquePageUrls.length ? uniquePageUrls.slice(0, 3).join(" ; ") : "-"));

                function tryBatch(urls, batchSize, batchNum) {
                    if (!urls || urls.length === 0) return Promise.resolve([]);
                    if (batchNum >= 3) return Promise.resolve([]);
                    if (tvRemaining() < 6000) return Promise.resolve([]);
                    var currentBatch = urls.slice(0, batchSize);
                    var remaining = urls.slice(batchSize);

                    var batchPromises = currentBatch.map(function(url) {
                        return extractStreamsFromEpisodePage(url).then(function(r) {
                            console.error("[JKAnime][v2.6-diag] lote" + batchNum + ": " + url + " -> " + (r ? r.length : 0) + " streams");
                            return r;
                        });
                    });

                    return Promise.all(batchPromises).then(function(results) {
                        for (var r = 0; r < results.length; r++) {
                            if (results[r] && results[r].length > 0) return results[r];
                        }
                        return tryBatch(remaining, batchSize, batchNum + 1);
                    });
                }

                return tryBatch(uniquePageUrls, 3, 0);

                });
            })
        })
        .catch(function(e) {
            console.error("[JKAnime][v2.6-diag] ERROR fatal: " + (e && e.message ? e.message : String(e)));
            return [];
        });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
