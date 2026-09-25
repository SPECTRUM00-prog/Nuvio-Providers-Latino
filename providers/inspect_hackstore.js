/**
 * Script de auditoría para Hackstore2 (API /api/rest)
 * Ejecución: node providers/inspect_hackstore.js
 */

var BASE_URL = "https://hackstore2.com";
var API_URL = BASE_URL + "/api/rest";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL
};

console.log("==================================================");
console.log("[*] AUDITORÍA DE HACKSTORE2");
console.log("==================================================\n");

// 1. Probar conectividad base
console.log("[1] Probando dominio base:", BASE_URL);
fetch(BASE_URL, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" })
    .then(function(res) {
        console.log("-> Status Base HTTP:", res.status, res.statusText);
        console.log("-> URL final (por si hubo redirección de dominio):", res.url);
        console.log("-> Servidor:", res.headers.get("server") || "N/A");
        console.log("-> Cloudflare Ray:", res.headers.get("cf-ray") || "Sin Cloudflare");

        // 2. Probar API de búsqueda
        var searchUrl = API_URL + "/search?q=Oppenheimer";
        console.log("\n[2] Consultando API de búsqueda:", searchUrl);
        return fetch(searchUrl, { headers: headers });
    })
    .then(function(res) {
        console.log("-> Status API Search:", res.status, res.statusText);
        return res.text();
    })
    .then(function(text) {
        console.log("-> Tamaño de respuesta:", text.length, "caracteres");
        try {
            var json = JSON.parse(text);
            console.log("[+] JSON de búsqueda recibido:");
            console.log(JSON.stringify(json, null, 2).substring(0, 700));

            var items = json.data || [];
            if (items.length > 0) {
                var first = items[0];
                var slug = first.slug || first.post_name;
                console.log("\n[+] Primer slug encontrado:", slug);

                // 3. Probar endpoint /single
                var singleUrl = API_URL + "/single?post_name=" + encodeURIComponent(slug) + "&post_type=movies";
                console.log("\n[3] Consultando endpoint /single:", singleUrl);
                return fetch(singleUrl, { headers: headers })
                    .then(function(r) { return r.json(); })
                    .then(function(sJson) {
                        console.log("[+] Ficha /single recibida:");
                        console.log(JSON.stringify(sJson, null, 2).substring(0, 600));

                        var postId = sJson.data && sJson.data._id;
                        if (postId) {
                            // 4. Probar endpoint /player
                            var playerUrl = API_URL + "/player?post_id=" + postId;
                            console.log("\n[4] Consultando endpoint /player:", playerUrl);
                            return fetch(playerUrl, { headers: headers })
                                .then(function(pr) { return pr.json(); })
                                .then(function(pJson) {
                                    console.log("[+] Embeds recibidos del reproductor:");
                                    console.log(JSON.stringify(pJson, null, 2).substring(0, 800));
                                });
                        }
                    });
            } else {
                console.log("[-] No devolvió items de búsqueda.");
            }
        } catch (e) {
            console.log("[-] No devolvió JSON válido. Primeros 250 caracteres:");
            console.log(text.substring(0, 250));
        }
    })
    .catch(function(err) {
        console.error("[-] Error en la auditoría:", err.message);
    });
