/**
 * Script de auditoría e inspección técnica para Cinecalidad y LaMovie
 * Ejecución: 
 *   node providers/inspect_cinelamovie.js [tmdbId] [kind]
 * Ejemplos:
 *   node providers/inspect_cinelamovie.js 533535 movie
 *   node providers/inspect_cinelamovie.js 85937 tv
 */

var tmdbId = process.argv[2] || "533535"; // Por defecto Deadpool & Wolverine o el ID pasado
var kind = process.argv[3] || "movie";    // "movie" o "tv"
var apiKind = kind === "movie" ? "movie" : "series";

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var defaultHeaders = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

function checkCloudflare(headers, bodyText) {
    var isCf = (headers.get("server") || "").toLowerCase().indexOf("cloudflare") !== -1;
    var cfRay = headers.get("cf-ray");
    var hasChallenge = bodyText.indexOf("Just a moment...") !== -1 || 
                       bodyText.indexOf("challenge-platform") !== -1 ||
                       bodyText.indexOf("turnstile") !== -1;
    return { isCf: isCf, cfRay: cfRay, blocked: hasChallenge };
}

function probeEmbed(embedUrl, refererHost) {
    console.log("      -> Auditando reproductor embebido:", embedUrl);
    return fetch(embedUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": refererHost,
            "Origin": refererHost.replace(/\/$/, "")
        },
        redirect: "follow"
    })
    .then(function(res) {
        console.log("         [Embed HTTP Status]:", res.status, res.statusText);
        console.log("         [Embed URL Final]:", res.url);
        return res.text();
    })
    .then(function(html) {
        console.log("         [Embed HTML Tamaño]:", html.length, "bytes");
        
        // Detectar si entrega un m3u8 directo, iframe o packed
        var m3u8Match = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
        var iframes = [];
        var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var im;
        while ((im = ifRegex.exec(html)) !== null) {
            iframes.push(im[1]);
        }

        if (m3u8Match) {
            console.log("         [+] ¡M3U8 DIRECTO ENCONTRADO!:", m3u8Match[0]);
        } else if (iframes.length > 0) {
            console.log("         [+] Iframes internos detectados:", iframes);
        } else if (html.indexOf("eval(function(p,a,c,k,e,") !== -1) {
            console.log("         [+] Código JavaScript Packed (Dean Edwards) detectado.");
        } else {
            console.log("         [-] Primeros 250 caracteres del embed:");
            console.log("         " + html.substring(0, 250).replace(/\r?\n/g, " "));
        }
    })
    .catch(function(err) {
        console.log("         [-] Error al consultar embed:", err.message);
    });
}

// ==============================================================
// 1. AUDITORÍA CINECALIDAD
// ==============================================================
function auditCinecalidad() {
    console.log("\n=================================================================");
    console.log(">>> [1/2] AUDITANDO CINECALIDAD (TMDB ID: " + tmdbId + " | " + kind + ") <<<");
    console.log("=================================================================");

    var apiUrl = "https://tmdb.cinecalidad.am/v1/items/" + apiKind + "/" + tmdbId;
    var webUrl = "https://cinecalidad.am/";

    console.log("[A] Probando API REST LITE:", apiUrl);
    return fetch(apiUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Referer": webUrl
        }
    })
    .then(function(res) {
        console.log("   -> API Status HTTP:", res.status, res.statusText);
        return res.text().then(function(text) {
            var cf = checkCloudflare(res.headers, text);
            console.log("   -> Servidor Cloudflare:", cf.isCf ? "SÍ (" + cf.cfRay + ")" : "No");
            console.log("   -> Desafío/Captcha:", cf.blocked ? "¡BLOQUEADO POR CLOUDFLARE!" : "Limpio");
            console.log("   -> Tamaño respuesta:", text.length, "bytes");

            try {
                var json = JSON.parse(text);
                console.log("   [+] JSON de Cinecalidad recibido y parseado con éxito:");
                console.log("   " + JSON.stringify(json, null, 2).substring(0, 400) + "...\n");

                // Extraer enlaces de servidores
                var embedsToTest = [];
                var extractFromLinks = function(linksArr) {
                    if (!Array.isArray(linksArr)) return;
                    for (var i = 0; i < linksArr.length; i++) {
                        var item = linksArr[i];
                        var link = item.url || item.link || item.embed || item;
                        if (typeof link === "string" && link.indexOf("http") === 0) {
                            embedsToTest.push({ lang: item.language || item.lang || "N/A", url: link });
                        }
                    }
                };

                if (json.links) extractFromLinks(json.links);
                if (json.players) extractFromLinks(json.players);
                if (json.items && json.items.links) extractFromLinks(json.items.links);

                // Si es un objeto genérico, buscar recursivamente cualquier URL que parezca reproductor
                if (embedsToTest.length === 0) {
                    var str = JSON.stringify(json);
                    var urlRegex = /https?:\/\/[^"'\s<>]*(?:vimeos|embed|player|stream|reproductor)[^"'\s<>]*/gi;
                    var um;
                    while ((um = urlRegex.exec(str)) !== null) {
                        embedsToTest.push({ lang: "Auto", url: um[0].replace(/\\/g, "") });
                    }
                }

                console.log("   [+] Servidores/Embeds encontrados en API (" + embedsToTest.length + "):");
                for (var e = 0; e < embedsToTest.length; e++) {
                    console.log("       [" + embedsToTest[e].lang + "] " + embedsToTest[e].url);
                }

                if (embedsToTest.length > 0) {
                    return probeEmbed(embedsToTest[0].url, "https://cinecalidad.am/");
                }
            } catch (e) {
                console.log("   [-] La respuesta no es JSON válido o la API cambió de ruta.");
                console.log("   Primeros 300 caracteres:", text.substring(0, 300));
            }
        });
    })
    .catch(function(err) {
        console.error("   [-] Error en test de Cinecalidad:", err.message);
    });
}

// ==============================================================
// 2. AUDITORÍA LAMOVIE / CUEVANA3.GS
// ==============================================================
function auditLaMovie() {
    console.log("\n=================================================================");
    console.log(">>> [2/2] AUDITANDO LAMOVIE / CUEVANA3.GS (TMDB ID: " + tmdbId + " | " + kind + ") <<<");
    console.log("=================================================================");

    var apiUrl1 = "https://tmdb2.cuevana3.gs/v1/items/" + apiKind + "/" + tmdbId;
    var webUrl = "https://cuevana3.gs/";

    console.log("[A] Probando API REST LITE oficial:", apiUrl1);
    return fetch(apiUrl1, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Referer": webUrl
        }
    })
    .then(function(res) {
        console.log("   -> API Status HTTP:", res.status, res.statusText);
        return res.text().then(function(text) {
            var cf = checkCloudflare(res.headers, text);
            console.log("   -> Servidor Cloudflare:", cf.isCf ? "SÍ (" + cf.cfRay + ")" : "No");
            console.log("   -> Desafío/Captcha:", cf.blocked ? "¡BLOQUEADO POR CLOUDFLARE!" : "Limpio");
            console.log("   -> Tamaño respuesta:", text.length, "bytes");

            try {
                var json = JSON.parse(text);
                console.log("   [+] JSON de LaMovie recibido y parseado con éxito:");
                console.log("   " + JSON.stringify(json, null, 2).substring(0, 400) + "...\n");

                var embedsToTest = [];
                var extractFromLinks = function(linksArr) {
                    if (!Array.isArray(linksArr)) return;
                    for (var i = 0; i < linksArr.length; i++) {
                        var item = linksArr[i];
                        var link = item.url || item.link || item.embed || item;
                        if (typeof link === "string" && link.indexOf("http") === 0) {
                            embedsToTest.push({ lang: item.language || item.lang || "N/A", url: link });
                        }
                    }
                };

                if (json.links) extractFromLinks(json.links);
                if (json.players) extractFromLinks(json.players);
                if (json.items && json.items.links) extractFromLinks(json.items.links);

                if (embedsToTest.length === 0) {
                    var str = JSON.stringify(json);
                    var urlRegex = /https?:\/\/[^"'\s<>]*(?:vimeos|embed|player|stream|reproductor)[^"'\s<>]*/gi;
                    var um;
                    while ((um = urlRegex.exec(str)) !== null) {
                        embedsToTest.push({ lang: "Auto", url: um[0].replace(/\\/g, "") });
                    }
                }

                console.log("   [+] Servidores/Embeds encontrados en API (" + embedsToTest.length + "):");
                for (var e = 0; e < embedsToTest.length; e++) {
                    console.log("       [" + embedsToTest[e].lang + "] " + embedsToTest[e].url);
                }

                if (embedsToTest.length > 0) {
                    return probeEmbed(embedsToTest[0].url, "https://cuevana3.gs/");
                }
            } catch (e) {
                console.log("   [-] La respuesta no es JSON válido o la API cambió.");
                console.log("   Primeros 300 caracteres:", text.substring(0, 300));
            }
        });
    })
    .catch(function(err) {
        console.error("   [-] Error en test de LaMovie:", err.message);
    });
}

// Ejecutar ambas auditorías en serie
auditCinecalidad()
    .then(function() { return auditLaMovie(); })
    .then(function() {
        console.log("\n=================================================================");
        console.log(">>> AUDITORÍA TÉCNICA COMPLETADA <<<");
        console.log("=================================================================");
    });
