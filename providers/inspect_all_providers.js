/**
 * Buscar cómo se envía data-player-token en SoloLatino (HTML + app-Bd31cN3M.js)
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
    var appBundleMatch = html.match(/https:\/\/sololatino\.net\/build\/assets\/app-[a-zA-Z0-9_-]+\.js/);

    console.log('>>> 1. BUSCANDO data-player-token / server-btn EN HTML');
    ['player-token', 'playerToken', 'server-btn', 'csrf-token'].forEach(function(k) {
        var idx = html.indexOf(k);
        if (idx !== -1) {
            console.log('[' + k + ' en HTML]: ' + html.slice(Math.max(0, idx - 60), idx + 350).replace(/\s+/g, ' '));
        }
    });

    if (appBundleMatch) {
        console.log('\n>>> 2. BUSCANDO EN BUNDLE: ' + appBundleMatch[0]);
        var js = await get(appBundleMatch[0]);
        ['player-token', 'playerToken', 'server-btn', 'player-frame'].forEach(function(k) {
            var idx = js.indexOf(k);
            if (idx !== -1) {
                console.log('\n[' + k + ' en JS]:');
                console.log(js.slice(Math.max(0, idx - 100), idx + 500).replace(/\s+/g, ' '));
            }
        });
    }
})();
