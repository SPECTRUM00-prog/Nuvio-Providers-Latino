/**
 * Verificación de cómo se rellena #player-frame y uso de Turnstile en SoloLatino
 * Ejecutar: node providers/inspect_all_providers.js
 */

var https = require('https');
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url) {
    return new Promise(function(resolve, reject) {
        var p = new URL(url);
        https.get({
            hostname: p.hostname,
            path: p.pathname + p.search,
            headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/' }
        }, function(res) {
            var c = [];
            res.on('data', function(d) { c.push(d); });
            res.on('end', function() { resolve(Buffer.concat(c).toString('utf8')); });
        }).on('error', reject);
    });
}

(async function() {
    var html = await get('https://sololatino.net/pelicula/matrix');

    var wrapIdx = html.indexOf('id="main-player-wrap"');
    if (wrapIdx !== -1) {
        console.log('=== BOTONES / TABS ANTES DE main-player-wrap ===');
        console.log(html.slice(Math.max(0, wrapIdx - 1800), wrapIdx));
    }

    ['player-frame', 'pelisserieshoy', '_slTurnstileReady'].forEach(function(term) {
        console.log('\n=== OCURRENCIAS DE "' + term + '" ===');
        var idx = 0, count = 0;
        while ((idx = html.indexOf(term, idx)) !== -1 && count < 3) {
            console.log('[' + (++count) + '] ' + html.slice(Math.max(0, idx - 120), idx + 320).replace(/\s+/g, ' '));
            idx += term.length;
        }
    });
})();
