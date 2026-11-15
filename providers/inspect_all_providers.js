/**
 * Inspección de API interna /wp-json/sololatino/v1/player y main.min.js
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
            res.on('end', function() { resolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') }); });
        });
        r.on('error', reject);
        if (body) r.write(body);
        r.end();
    });
}

(async function() {
    console.log('>>> 1. INSPECCIONANDO RUTAS EN main.min.js');
    var jsRes = await req('https://sololatino.net/wp-content/themes/sololatino/assets/js/main.min.js?ver=1.2.156');
    var idx = jsRes.body.indexOf('player_api');
    if (idx !== -1) {
        console.log('Contexto player_api en JS:\n' + jsRes.body.slice(Math.max(0, idx - 150), idx + 700));
    }
    var wpJsonRoutes = jsRes.body.match(/sololatino\/v1\/[a-zA-Z0-9_\/-]+/g) || [];
    console.log('\nRutas sololatino/v1 detectadas:', wpJsonRoutes);

    console.log('\n>>> 2. PROBANDO /wp-json/sololatino/v1/player');
    var tests = [
        { m: 'GET', u: 'https://sololatino.net/wp-json/sololatino/v1/player?post_id=33603' },
        { m: 'GET', u: 'https://sololatino.net/wp-json/sololatino/v1/player?tmdb_id=603&type=movie' },
        { m: 'POST', u: 'https://sololatino.net/wp-json/sololatino/v1/player', b: JSON.stringify({ post_id: 33603, nonce: '98e62920db' }), h: { 'Content-Type': 'application/json' } }
    ];
    for (var i = 0; i < tests.length; i++) {
        var t = tests[i];
        var r = await req(t.u, t.m, t.b, t.h);
        console.log('[' + t.m + ' ' + r.status + '] ' + t.u);
        console.log('  Body:', r.body.slice(0, 350));
    }
})();
