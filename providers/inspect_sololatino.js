/**
 * Auditoría profunda y exhaustiva de SoloLatino (sololatino.net)
 * Inspecciona: Pestaña Latino/Sub, botones "Principal", "SLPLAYER", "VIP",
 *              iframes ocultos, llamadas AJAX y servidores lockers reales.
 * Ejecución: node providers/inspect_sololatino.js
 */

var TARGET_URL = "https://sololatino.net/pelicula/coraline-y-la-puerta-secreta";
var BASE_URL = "https://sololatino.net";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var defaultHeaders = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

function fetchHtml(url, customHeaders) {
    return fetch(url, { headers: customHeaders || defaultHeaders, redirect: "follow" })
        .then(function(res) {
            return res.text().then(function(text) {
                return { status: res.status, url: res.url, html: text };
            });
        })
        .catch(function(err) {
            return { status: 0, url: url, html: "", error: err.message };
        });
}

console.log("=================================================================");
console.log(">>> [FASE 1] DESCARGANDO FICHA COMPLETA DE CORALINE EN SOLOLATINO <<<");
console.log("=================================================================");
console.log("URL:", TARGET_URL);

fetchHtml(TARGET_URL).then(function(res) {
    if (res.status !== 200 || !res.html) {
        console.log("[-] Error descargando la página. Status:", res.status);
        return;
    }

    var html = res.html;
    console.log("-> Status HTTP:", res.status);
    console.log("-> Tamaño HTML:", html.length, "bytes\n");

    // =============================================================
    // 1. RASTREAR ESTRUCTURA DE PESTAÑAS (Principal, SLPLAYER, VIP)
    // =============================================================
    console.log("=================================================================");
    console.log(">>> [FASE 2] EXTRAYENDO BOTONES Y ATRIBUTOS DE CADA REPRODUCTOR <<<");
    console.log("=================================================================");

    // Buscar cualquier elemento que contenga Principal, SLPLAYER o VIP
    var playerTargets = [];
    var elemRegex = /<(?:button|li|a|div)[^>]+(?:data-[a-zA-Z0-9_-]+=["'][^"']*["'][^>]*)*>[\s\S]*?<\/(?:button|li|a|div)>/gi;
    var em;

    while ((em = elemRegex.exec(html)) !== null) {
        var str = em[0];
        if (str.indexOf("Principal") !== -1 || str.indexOf("SLPLAYER") !== -1 || str.indexOf("VIP") !== -1) {
            // Extraer todos los atributos data-* de este botón
            var attrs = {};
            var attrRegex = /(data-[a-zA-Z0-9_-]+)=["']([^"']*)["']/gi;
            var am;
            while ((am = attrRegex.exec(str)) !== null) {
                attrs[am[1]] = am[2];
            }
            var label = str.replace(/<[^>]+>/g, "").trim();
            playerTargets.push({ label: label, rawHtml: str.trim(), attrs: attrs });
        }
    }

    console.log("[+] Botones del reproductor detectados en el DOM (" + playerTargets.length + "):");
    for (var i = 0; i < playerTargets.length; i++) {
        var pt = playerTargets[i];
        console.log("\n   [" + (i + 1) + "] BOTÓN: \"" + pt.label + "\"");
        console.log("       Atributos data-*:", JSON.stringify(pt.attrs, null, 2));
        console.log("       HTML original:", pt.rawHtml.substring(0, 150));
    }

    // =============================================================
    // 2. EXTRAER CONTENEDORES OCULTOS (DIVS CON IFRAMES / REPRODUCTORES)
    // =============================================================
    console.log("\n=================================================================");
    console.log(">>> [FASE 3] INSPECCIONANDO CONTENEDORES OCULTOS (IFRAMES / TABS) <<<");
    console.log("=================================================================");

    // Buscar contenedores de reproductor tipo #source-player-*, .player-box, .tab-pane, etc.
    var tabDivRegex = /<div[^>]+id=["']([^"']*(?:player|source|opt|server|video|embed)[^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi;
    var tm;
    var foundContainers = [];

    while ((tm = tabDivRegex.exec(html)) !== null) {
        var divId = tm[1];
        var divContent = tm[2];
        var iframesInDiv = [];
        var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var ifm;
        while ((ifm = ifRegex.exec(divContent)) !== null) {
            iframesInDiv.push(ifm[1]);
        }

        if (iframesInDiv.length > 0 || divContent.indexOf("http") !== 0) {
            foundContainers.push({ id: divId, iframes: iframesInDiv, snippet: divContent.trim().substring(0, 200) });
        }
    }

    console.log("[+] Contenedores de reproducción encontrados (" + foundContainers.length + "):");
    for (var c = 0; c < foundContainers.length; c++) {
        console.log("\n   * Contenedor ID: #" + foundContainers[c].id);
        console.log("     Iframes dentro:", foundContainers[c].iframes);
        console.log("     Muestra interna:", foundContainers[c].snippet.replace(/\r?\n\s*/g, " "));
    }

    // =============================================================
    // 3. RASTREAR VARIABLES Y ARRAYS EN SCRIPTS JS
    // =============================================================
    console.log("\n=================================================================");
    console.log(">>> [FASE 4] RASTREANDO CONFIGURACIONES GLOBALES Y ARRAYS JS <<<");
    console.log("=================================================================");

    var scriptVars = [];
    var jsVarRegex = /(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*([\[\{][\s\S]*?[\]\}]);/gi;
    var jvm;

    while ((jvm = jsVarRegex.exec(html)) !== null) {
        var vName = jvm[1];
        var vVal = jvm[2];
        // Filtrar variables que contengan referencias a embeds, players, servers o urls
        if (vVal.indexOf("http") !== -1 || vVal.indexOf("embed") !== -1 || vVal.indexOf("server") !== -1 || vVal.indexOf("slplayer") !== -1) {
            scriptVars.push({ name: vName, preview: vVal.substring(0, 300) });
        }
    }

    console.log("[+] Variables relevantes encontradas en scripts (" + scriptVars.length + "):");
    for (var v = 0; v < scriptVars.length; v++) {
        console.log("\n   * Variable: " + scriptVars[v].name);
        console.log("     Valor:", scriptVars[v].preview.replace(/\r?\n\s*/g, " ") + "...");
    }

    // =============================================================
    // 4. RECOLECTAR TODAS LAS URLs DE IFRAMES Y EMBEDS PARA AUDITARLAS
    // =============================================================
    console.log("\n=================================================================");
    console.log(">>> [FASE 5] AUDITANDO EN VIVO LOS REPRODUCTORES DESCUBIERTOS <<<");
    console.log("=================================================================");

    var rawUrlsToTest = [];

    // Agregar de iframes
    var allIframes = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
    for (var af = 0; af < allIframes.length; af++) {
        var srcMatch = allIframes[af].match(/src=["']([^"']+)["']/i);
        if (srcMatch && rawUrlsToTest.indexOf(srcMatch[1]) === -1) {
            rawUrlsToTest.push({ source: "Iframe Directo", url: srcMatch[1] });
        }
    }

    // Agregar de data-attrs
    for (var pIdx = 0; pIdx < playerTargets.length; pIdx++) {
        var at = playerTargets[pIdx].attrs;
        for (var k in at) {
            var val = at[k];
            if (val.indexOf("http") === 0 || val.indexOf("//") === 0) {
                if (val.indexOf("//") === 0) val = "https:" + val;
                rawUrlsToTest.push({ source: "Botón [" + playerTargets[pIdx].label + "] (" + k + ")", url: val });
            }
        }
    }

    // Agregar lockers incrustados en código general
    var genericLockers = html.match(/https?:\/\/[a-zA-Z0-9.-]*(?:embed69|slplayer|morencius|vidhide|streamwish|hglink|filemoon|voe|vimeos)[^\s"'<>]+/gi) || [];
    for (var gl = 0; gl < genericLockers.length; gl++) {
        var cleanGl = genericLockers[gl].replace(/\\/g, "").replace(/&amp;/g, "&");
        var already = false;
        for (var u = 0; u < rawUrlsToTest.length; u++) {
            if (rawUrlsToTest[u].url === cleanGl) { already = true; break; }
        }
        if (!already) {
            rawUrlsToTest.push({ source: "Locker detectado en script", url: cleanGl });
        }
    }

    console.log("[+] Total de enlaces/reproductores para probar en vivo (" + rawUrlsToTest.length + "):\n");

    function probePlayer(index) {
        if (index >= rawUrlsToTest.length) {
            console.log("\n=================================================================");
            console.log(">>> AUDITORÍA PROFUNDA DE SOLOLATINO COMPLETADA <<<");
            console.log("=================================================================");
            return;
        }

        var item = rawUrlsToTest[index];
        console.log("-----------------------------------------------------------------");
        console.log("[" + (index + 1) + "/" + rawUrlsToTest.length + "] Origen: " + item.source);
        console.log("URL:", item.url);

        fetchHtml(item.url, { "User-Agent": USER_AGENT, "Referer": TARGET_URL })
            .then(function(embedRes) {
                console.log("   -> Status HTTP:", embedRes.status);
                console.log("   -> URL final tras redirección:", embedRes.url);
                console.log("   -> Tamaño respuesta:", embedRes.html.length, "bytes");

                // Buscar lockers dentro de este reproductor
                var subIframes = [];
                var sifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
                var sm;
                while ((sm = sifRegex.exec(embedRes.html)) !== null) {
                    subIframes.push(sm[1]);
                }
                if (subIframes.length > 0) {
                    console.log("   [+] Iframes internos:", subIframes);
                }

                // Detectar si tiene m3u8 directo
                var m3u8 = embedRes.html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) {
                    console.log("   [+] ¡STREAM M3U8 DIRECTO ENCONTRADO!:", m3u8[0]);
                }

                // Detectar PoW o AES
                if (embedRes.html.indexOf("POW_CHALLENGE") !== -1) {
                    console.log("   [!] Requiere reto Proof of Work (Embed69 engine)");
                }

                probePlayer(index + 1);
            });
    }

    probePlayer(0);
});
