/**
 * Probar POST /s.php y ver parámetros de _p y _qt/_qv en player.pelisserieshoy.com
 * Ejecutar: node providers/inspect_all_providers.js
 */

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

(async function() {
    var pageRes = await fetch('https://sololatino.net/pelicula/matrix', {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/' }
    });
    var html = await pageRes.text();
    var csrf = (html.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1] || '';
    var tok = (html.match(/data-player-token="([^"]+)"/i) || [])[1] || '';

    var apiRes = await fetch('https://sololatino.net/api/player-url', {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Origin': 'https://sololatino.net',
            'Referer': 'https://sololatino.net/pelicula/matrix',
            'X-CSRF-TOKEN': csrf,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ t: tok })
    });
    var apiJson = await apiRes.json();
    var playerUrl = apiJson.url;

    var pRes = await fetch(playerUrl, {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/pelicula/matrix' }
    });
    var pHtml = await pRes.text();

    var tMatch = pHtml.match(/const\s+_t\s*=\s*'([^']+)'/);
    var _t = tMatch ? tMatch[1] : '';
    console.log('Token _t:', _t);

    // Ver cómo se definen _qv / _qt y _p
    ['_qv', 'const _p', 'new URLSearchParams', 'scanAndShow'].forEach(function(term) {
        console.log('\n=== "' + term + '" ===');
        var i = 0, c = 0;
        while ((i = pHtml.indexOf(term, i)) !== -1 && c < 3) {
            console.log('[' + (++c) + '] ' + pHtml.slice(Math.max(0, i - 140), i + 280).replace(/\s+/g, ' '));
            i += term.length;
        }
    });

    // Probar POST directo a /s.php con a=1&tok=_t
    if (_t) {
        var cookies = typeof pRes.headers.getSetCookie === 'function'
            ? pRes.headers.getSetCookie().map(function(x) { return x.split(';')[0]; }).join('; ')
            : '';

        console.log('\n>>> PROBANDO POST https://player.pelisserieshoy.com/s.php (a=1)');
        var sRes = await fetch('https://player.pelisserieshoy.com/s.php', {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://player.pelisserieshoy.com',
                'Referer': playerUrl,
                'Cookie': cookies
            },
            body: 'a=1&tok=' + encodeURIComponent(_t)
        });
        console.log('Status:', sRes.status, '| Respuesta:', await sRes.text());
    }
})();
