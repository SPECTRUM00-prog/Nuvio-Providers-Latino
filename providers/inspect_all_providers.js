/**
 * Probar POST /api/player-url y formato de episodios en SoloLatino
 * Ejecutar: node providers/inspect_all_providers.js
 */

var https = require('https');
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function req(url, method, body, headers) {
    return new Promise(function(resolve, reject) {
        var p = new URL(url);
        var opts = {
            hostname: p.hostname,
            path: p.pathname + p.search,
            method: method || 'GET',
            headers: Object.assign({
                'User-Agent': UA,
                'Referer': 'https://sololatino.net/pelicula/matrix',
                'Origin': 'https://sololatino.net'
            }, headers || {})
        };
        var r = https.request(opts, function(res) {
            var c = [];
            res.on('data', function(d) { c.push(d); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    setCookie: res.headers['set-cookie'] || [],
                    body: Buffer.concat(c).toString('utf8')
                });
            });
        });
        r.on('error', reject);
        if (body) r.write(body);
        r.end();
    });
}

(async function() {
    // 1. Obtener ficha, csrf-token, cookies y tokens de servidores
    var page = await req('https://sololatino.net/pelicula/matrix');
    var cookies = page.setCookie.map(function(c) { return c.split(';')[0]; }).join('; ');
    var csrfMatch = page.body.match(/name="csrf-token"\s+content="([^"]+)"/i);
    var csrf = csrfMatch ? csrfMatch[1] : '';

    var btns = [];
    var btnRegex = /data-lang-group="([^"]+)"[\s\S]*?<\/div>\s*<\/div>/gi;
    var tokRegex = /data-player-token="([^"]+)"[^>]*>([\s\S]*?)<\/button>/gi;
    var m;
    while ((m = tokRegex.exec(page.body)) !== null) {
        btns.push({
            token: m[1],
            label: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        });
    }

    console.log('CSRF:', csrf, '| Cookies:', cookies ? 'OK (' + page.setCookie.length + ')' : 'Sin cookies');
    console.log('Botones detectados:', btns.length);

    // 2. Probar POST /api/player-url con cada botón
    for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        var apiRes = await req(
            'https://sololatino.net/api/player-url',
            'POST',
            JSON.stringify({ t: b.token }),
            {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': csrf,
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookies
            }
        );
        console.log('\n[' + b.label + '] Status:', apiRes.status);
        console.log('  Respuesta:', apiRes.body.slice(0, 300));
    }

    // 3. Ver estructura de series y episodios
    console.log('\n>>> PROBANDO BÚSQUEDA DE SERIE (/buscar?q=game%20of%20thrones)');
    var sRes = await req('https://sololatino.net/buscar?q=game%20of%20thrones');
    var serieLinks = sRes.body.match(/https?:\/\/sololatino\.net\/serie\/[^"'\s<>]+/gi) || [];
    console.log('Series encontradas:', serieLinks.slice(0, 3));
    if (serieLinks.length > 0) {
        var epPage = await req(serieLinks[0]);
        var epLinks = epPage.body.match(/https?:\/\/sololatino\.net\/[^"'\s<>]*(?:episodio|temporada|1x1)[^"'\s<>]*/gi) || [];
        var uniqEp = [];
        epLinks.forEach(function(e) { if (uniqEp.indexOf(e) === -1) uniqEp.push(e); });
        console.log('Enlaces de episodio en serie:', uniqEp.slice(0, 6));
    }
})();
