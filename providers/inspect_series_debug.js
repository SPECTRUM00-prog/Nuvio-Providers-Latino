/**
 * Diagnóstico exacto de Series para LaMovie y Cinecalidad
 * Ejecución: node providers/inspect_series_debug.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT, "Referer": "https://lamovie.org/" };

console.log("=================================================================");
console.log(">>> [1/2] OBTENIENDO UNA SERIE REAL DIRECTAMENTE DE /series/ <<<");
console.log("=================================================================");

fetch("https://lamovie.org/series/", { headers: headers })
.then(function(res) { return res.text(); })
.then(function(html) {
    // Buscar enlaces a series reales en el HTML del catálogo
    var seriesLinks = [];
    var regex = /href=["'](https?:\/\/lamovie\.org\/series\/[^"']+)["']/gi;
    var m;
    while ((m = regex.exec(html)) !== null) {
        if (seriesLinks.indexOf(m[1]) === -1 && m[1] !== "https://lamovie.org/series/") {
            seriesLinks.push(m[1]);
        }
    }

    console.log("[+] Series encontradas en catálogo (" + seriesLinks.length + "):");
    for (var i = 0; i < Math.min(3, seriesLinks.length); i++) {
        console.log("    [" + (i + 1) + "] " + seriesLinks[i]);
    }

    var targetSeriesUrl = seriesLinks[0] || "https://lamovie.org/series/visionquest-2026/";
    var slugMatch = targetSeriesUrl.match(/\/series\/([^/]+)/);
    var slug = slugMatch ? slugMatch[1] : "visionquest-2026";

    console.log("\n[+] Probando búsqueda con slug real:", slug);

    return fetch("https://lamovie.org/wp-api/v1/search?q=" + encodeURIComponent(slug.replace(/-/g, " ")), { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(searchRes) {
        console.log("-> Respuesta cruda de la búsqueda:");
        console.log(JSON.stringify(searchRes, null, 2).substring(0, 400) + "...\n");

        var posts = (searchRes && searchRes.data && searchRes.data.posts) || [];
        var serie = posts[0];

        if (!serie) {
            console.log("[-] La búsqueda no indexó por texto. Probando descarga directa de la página de la serie...");
            return fetch(targetSeriesUrl, { headers: headers })
                .then(function(r) { return r.text(); })
                .then(function(pageHtml) {
                    // Extraer ID del post en la página
                    var idMatch = pageHtml.match(/data-id=["'](\d+)["']/i) || 
                                  pageHtml.match(/postId\s*[:=]\s*["']?(\d+)/i) ||
                                  pageHtml.match(/post_id\s*[:=]\s*["']?(\d+)/i) ||
                                  pageHtml.match(/["']_id["']\s*:\s*(\d+)/i);
                    if (idMatch) {
                        console.log("[+] ID de serie encontrado en HTML:", idMatch[1]);
                        return testEpisodes(idMatch[1]);
                    } else {
                        console.log("[-] No se encontró ID explícito en el HTML de la serie.");
                    }
                });
        }

        console.log("[+] Serie confirmada:", serie.title, "| _id:", serie._id, "| tipo:", serie.type);
        return testEpisodes(serie._id);
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});

function testEpisodes(seriesId) {
    console.log("\n=================================================================");
    console.log(">>> [2/2] CONSULTANDO EPISODIOS PARA SERIE ID: " + seriesId + " <<<");
    console.log("=================================================================");

    var epUrl = "https://lamovie.org/wp-json/wpf/v1/episodes?post_id=" + seriesId;
    console.log("Consultando:", epUrl);

    return fetch(epUrl, { headers: headers })
    .then(function(r) { return r.text(); })
    .then(function(txt) {
        console.log("Respuesta de episodios (primeros 600 caracteres):");
        console.log(txt.substring(0, 600));

        try {
            var json = JSON.parse(txt);
            var epList = Array.isArray(json) ? json : (json.data || json.episodes || []);
            if (epList.length > 0) {
                var first = epList[0];
                var epId = first._id || first.id;
                console.log("\n[+] ¡Éxito! Primer episodio detectado:", first.title || first.name, "| ID:", epId);
                console.log("Probando reproductor para el episodio ID:", epId);
                return fetch("https://lamovie.org/wp-api/v1/player?postId=" + epId + "&demo=0", { headers: headers })
                    .then(function(pr) { return pr.text(); })
                    .then(function(ptxt) {
                        console.log("Respuesta del reproductor de episodio:");
                        console.log(ptxt.substring(0, 500));
                    });
            }
        } catch(e) {}
    });
}
