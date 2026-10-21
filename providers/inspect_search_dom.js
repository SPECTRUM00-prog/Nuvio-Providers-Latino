/**
 * Script de volcado del DOM para Cinecalidad y LaMovie
 * Ejecución: node providers/inspect_search_dom.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

function inspectHtml(name, url) {
    console.log("\n=================================================================");
    console.log(">>> INSPECCIONANDO DOM DE:", name, "(" + url + ") <<<");
    console.log("=================================================================");

    return fetch(url, { headers: headers })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            console.log("-> Tamaño HTML:", html.length, "bytes");

            // 1. Extraer todas las etiquetas <a> relevantes
            var links = [];
            var regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var m;
            while ((m = regex.exec(html)) !== null) {
                var href = m[1];
                var text = m[2].replace(/<[^>]+>/g, "").trim();

                // Filtrar links comunes de navegación/menú
                if (href !== "#" && href.indexOf("wp-") === -1 && href.indexOf("category") === -1 && 
                    href.indexOf("genero") === -1 && href.indexOf("tag") === -1 && href.indexOf("login") === -1 &&
                    href.length > 5) {
                    links.push({ href: href, title: text });
                }
            }

            console.log("-> Enlaces de contenido encontrados (" + links.length + "):");
            // Mostrar los primeros 10 enlaces encontrados
            for (var i = 0; i < Math.min(10, links.length); i++) {
                console.log("   [" + (i + 1) + "] href: " + links[i].href + " | Título: " + links[i].title);
            }

            // 2. Extraer fragmento de una tarjeta o artículo
            var articleMatch = html.match(/<(?:article|div)[^>]+class=["'][^"']*(?:item|post|card|pelicula|result)[^"']*["'][\s\S]{1,600}?<\/(?:article|div)>/i);
            if (articleMatch) {
                console.log("\n-> Ejemplo de contenedor de tarjeta en HTML:");
                console.log(articleMatch[0].replace(/\t|\r/g, "").substring(0, 500) + "...\n");
            }
        })
        .catch(function(err) {
            console.error("[-] Error:", err.message);
        });
}

inspectHtml("CINECALIDAD", "https://cinecalidad.ec/?s=deadpool")
    .then(function() {
        return inspectHtml("LAMOVIE", "https://lamovie.org/?s=deadpool");
    });
