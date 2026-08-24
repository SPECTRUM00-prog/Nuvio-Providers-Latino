const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function resolveDoodStream(embedUrl) {
    console.log(`=== PROBANDO DOODSTREAM: ${embedUrl} ===`);
    var domainMatch = embedUrl.match(/^https?:\/\/[^\/]+/i);
    if (!domainMatch) return Promise.resolve(null);
    var baseDomain = domainMatch[0];

    return fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var passMatch = html.match(/\/pass_md5\/[^"']+/i);
        if (!passMatch) {
            console.log("❌ No se encontró /pass_md5 en el HTML");
            return null;
        }

        var passUrl = baseDomain + passMatch[0];
        var tokenMatch = html.match(/token=([a-zA-Z0-9_-]+)/i);
        var token = tokenMatch ? tokenMatch[1] : (html.match(/token\s*=\s*["']([^"']+)["']/i) || [])[1];

        console.log(`Endpoint descubierto: ${passUrl}`);

        return fetch(passUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": embedUrl }
        })
        .then(function(res) { return res.text(); })
        .then(function(rawUrl) {
            if (!rawUrl || rawUrl.indexOf("http") === -1) {
                console.log("❌ Respuesta inválida de pass_md5:", rawUrl);
                return null;
            }

            var randChars = "";
            var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            for (var i = 0; i < 10; i++) randChars += chars.charAt(Math.floor(Math.random() * chars.length));

            var finalUrl = rawUrl.trim() + randChars + (token ? ("?token=" + token + "&expiry=" + Date.now()) : "");
            
            console.log("\n🎉 ¡STREAM DE DOODSTREAM EXTRAÍDO CON ÉXITO!");
            console.log("URL directa:", finalUrl);

            return {
                url: finalUrl,
                quality: "720p",
                server: "DoodStream",
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": embedUrl
                }
            };
        });
    })
    .catch(function(e) {
        console.error("Error en DoodStream:", e.message);
        return null;
    });
}

resolveDoodStream("https://doodstream.com/e/yg9ke0hza0yq");
