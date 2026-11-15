/**
 * Localizar cálculo de _qt / _qh y probar POST /s.php (a=1 y a=2)
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
            'User-Agent': UA, 'Accept': 'application/json', 'Content-Type': 'application/json',
            'Origin': 'https://sololatino.net', 'Referer': 'https://sololatino.net/pelicula/matrix',
            'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ t: tok })
    });
    var playerUrl = (await apiRes.json()).url;

    var pRes = await fetch(playerUrl, {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/pelicula/matrix' }
    });
    var pHtml = await pRes.text();

    // 1. Buscar todas las apariciones de _qt y _qh(
    ['_qt', '_qh(', '_qsrc'].forEach(function(term) {
        console.log('\n=== "' + term + '" ===');
        var i = 0, c = 0;
        while ((i = pHtml.indexOf(term, i)) !== -1 && c < 5) {
            console.log('[' + (++c) + '] ' + pHtml.slice(Math.max(0, i - 60), i + 200).replace(/\s+/g, ' '));
            i += term.length;
        }
    });

    // 2. Armar _qv dinámicamente leyendo _qk y la fórmula de _q9()
    var _t = (pHtml.match(/const\s+_t\s*=\s*'([^']+)'/) || [])[1] || '';
    var qkMatch = pHtml.match(/var\s+_qk\s*=\s*(\[[^\]]+\])/);
    var q9Match = pHtml.match(/function\s+_q9\s*\(\)\s*\{\s*return\s+([^;]+);/);
    var _qv = '';
    if (qkMatch && q9Match) {
        var _qk = JSON.parse(qkMatch[1]);
        _qv = q9Match[1].replace(/_qk\[(\d+)\]/g, function(_, idx) { return _qk[parseInt(idx, 10)] || ''; }).replace(/\s*\+\s*/g, '');
    }

    // 3. Probar POST /s.php con a=1, tok, rt=_qv, ao=https://sololatino.net
    var cookies = typeof pRes.headers.getSetCookie === 'function'
        ? pRes.headers.getSetCookie().map(function(x) { return x.split(';')[0]; }).join('; ')
        : '';

    var bodyParams = new URLSearchParams({
        a: '1',
        tok: _t,
        rt: _qv,
        tk: '',
        ao: 'https://sololatino.net'
    });

    console.log('\n>>> PROBANDO /s.php (a=1) CON rt + ao');
    var sRes = await fetch('https://player.pelisserieshoy.com/s.php', {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://player.pelisserieshoy.com',
            'Referer': playerUrl,
            'Cookie': cookies
        },
        body: bodyParams.toString()
    });
    var sText = await sRes.text();
    console.log('Status:', sRes.status, '| Respuesta:', sText.slice(0, 1200));
})();
