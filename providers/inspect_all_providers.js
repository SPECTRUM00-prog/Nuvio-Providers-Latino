/**
 * Inspección del nuevo reproductor Laravel y player.pelisserieshoy.com en SoloLatino
 * Ejecutar: node providers/inspect_all_providers.js
 */

var https = require('https');
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url, ref) {
    return new Promise(function(resolve, reject) {
        var p = new URL(url);
        https.get({
            hostname: p.hostname,
            path: p.pathname + p.search,
            headers: { 'User-Agent': UA, 'Referer': ref || 'https://sololatino.net/' }
        }, function(res) {
            var c = [];
            res.on('data', function(d) { c.push(d); });
            res.on('end', function() { resolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') }); });
        }).on('error', reject);
    });
}

(async function() {
    console.log('>>> 1. PROBANDO BUSCADOR /buscar?q=matrix');
    var sRes = await get('https://sololatino.net/buscar?q=matrix');
    var links = sRes.body.match(/https?:\/\/sololatino\.net\/(?:pelicula|serie)\/[^"'\s<>]+/gi) || [];
    var uniq = [];
    links.forEach(function(l) { if (uniq.indexOf(l) === -1) uniq.push(l); });
    console.log('Status:', sRes.status, '| Resultados:', uniq.slice(0, 5));

    console.log('\n>>> 2. INSPECCIONANDO main-player-wrap Y pelisserieshoy.com EN /pelicula/matrix');
    var mRes = await get('https://sololatino.net/pelicula/matrix');
    var pIdx = mRes.body.indexOf('main-player-wrap');
    if (pIdx !== -1) {
        console.log('--- Bloque main-player-wrap ---');
        console.log(mRes.body.slice(Math.max(0, pIdx - 100), pIdx + 1600));
    }

    var pshMatches = mRes.body.match(/https?:\/\/player\.pelisserieshoy\.com[^"'\s<>\\]*/gi) || [];
    console.log('\nURLs player.pelisserieshoy.com encontradas:', pshMatches);

    if (pshMatches.length > 0) {
        console.log('\n>>> 3. PROBANDO RESPUESTA DE: ' + pshMatches[0]);
        var pRes = await get(pshMatches[0], 'https://sololatino.net/pelicula/matrix');
        console.log('Status:', pRes.status, '| Bytes:', pRes.body.length);
        console.log('Preview:\n' + pRes.body.slice(0, 1000));
    }
})();
