/**
 * Test de API JSON CineCalidad LITE
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var hosts = [
    "https://www.cinecalidad.am",
    "https://tmdb.cinecalidad.am"
];

function testSearch(host, query) {
    var url = host + "/v1/search?q=" + encodeURIComponent(query);
    console.log("[*] Probando:", url);

    return fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Referer": "https://www.cinecalidad.am/"
        }
    })
    .then(function(res) {
        console.log("-> Status (" + host + "):", res.status);
        return res.text();
    })
    .then(function(text) {
        try {
            var json = JSON.parse(text);
            console.log("[+] JSON recibido con éxito (" + host + "):");
            console.log(JSON.stringify(json, null, 2).substring(0, 700));
            return { host: host, data: json };
        } catch(e) {
            console.log("[-] No devolvió JSON válido en " + host + ". (Primeros 150 caracteres: " + text.substring(0, 150) + ")");
            return null;
        }
    })
    .catch(function(err) {
        console.log("[-] Error conectando a " + host + ": " + err.message);
        return null;
    });
}

// Probar ambos hosts con Oppenheimer
testSearch(hosts[0], "Oppenheimer").then(function(res1) {
    if (!res1) {
        return testSearch(hosts[1], "Oppenheimer");
    }
    return res1;
}).then(function(active) {
    if (!active || !active.data) return;

    var targetHost = active.host;
    // Si encontramos resultados, probar consultar el detalle /v1/items de ese título
    var items = active.data.results || active.data.items || active.data.data || (Array.isArray(active.data) ? active.data : []);
    if (items.length > 0) {
        var first = items[0];
        console.log("\n[+] Primer resultado de búsqueda:", first);

        var idOrSlug = first.id || first.slug || first._id;
        var detailUrl = targetHost + "/v1/items/" + idOrSlug;
        console.log("\n[*] Consultando detalles del item:", detailUrl);

        return fetch(detailUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Referer": "https://www.cinecalidad.am/"
            }
        })
        .then(function(r) { return r.json(); })
        .then(function(detail) {
            console.log("[+] Ficha de detalles / fileCode:");
            console.log(JSON.stringify(detail, null, 2).substring(0, 800));
        });
    }
});
