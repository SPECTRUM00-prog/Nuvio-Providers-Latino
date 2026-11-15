/**
 * Diagnóstico de Coraline (14836) en SoloLatino y player.pelisserieshoy.com
 * Ejecutar: node providers/inspect_all_providers.js
 */

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function fnv1a(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return (h >>> 0).toString(16);
}

(async function() {
    console.log('>>> 1. OBTENIENDO FICHA DE CORALINE EN SOLOLATINO');
    // Coraline en sololatino
    var targetMovie = 'https://sololatino.net/pelicula/coraline-y-la-puerta-secreta';
    var pageRes = await fetch(targetMovie, {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/' }
    });
    if (!pageRes.ok) {
        console.log('Fallo cargando', targetMovie, 'HTTP', pageRes.status);
        return;
    }
    var html = await pageRes.text();
    var csrf = (html.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1] || '';
    var tok = (html.match(/data-player-token="([^"]+)"/i) || [])[1] || '';

    console.log('CSRF:', csrf ? 'OK' : 'NO', '| Token:', tok ? 'OK' : 'NO');

    console.log('\n>>> 2. CANJEANDO TOKEN EN /api/player-url');
    var apiRes = await fetch('https://sololatino.net/api/player-url', {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Origin': 'https://sololatino.net',
            'Referer': targetMovie,
            'X-CSRF-TOKEN': csrf,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ t: tok })
    });

    var apiJson = await apiRes.json();
    console.log('Player URL:', apiJson.url);

    if (!apiJson.url) return;

    console.log('\n>>> 3. DESCARGANDO PLAYER DE PELISSERIESHOY');
    var pRes = await fetch(apiJson.url, {
        headers: { 'User-Agent': UA, 'Referer': targetMovie }
    });
    var pHtml = await pRes.text();

    var _t = (pHtml.match(/const\s+_t\s*=\s*'([^']+)'/) || [])[1] || '';
    var _qc = (pHtml.match(/var\s+_qc\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '';
    var qkMatch = pHtml.match(/(?:var|let|const)\s+_qk\s*=\s*(\[[^\]]+\])/);
    var q9Match = pHtml.match(/function\s+_q9\s*\(\)\s*\{\s*return\s+([^;]+);/);

    console.log('Token _t:', _t);
    console.log('IMDb _qc:', _qc);
    console.log('Formula _q9:', q9Match ? q9Match[1] : 'NO ENCONTRADA');

    var _qv = '';
    if (qkMatch && q9Match) {
        var _qk = JSON.parse(qkMatch[1]);
        _qv = q9Match[1].replace(/_qk\[(\d+)\]/g, function(_, idx) {
            return _qk[parseInt(idx, 10)] || '';
        }).replace(/\s*\+\s*/g, '');
    }
    console.log('_qv calculado:', _qv);

    var _qt = fnv1a((_qv || '') + '|clk|' + (_qc || ''));
    console.log('_qt (hash FNV-1a):', _qt);

    var cookies = typeof pRes.headers.getSetCookie === 'function'
        ? pRes.headers.getSetCookie().map(function(x) { return x.split(';')[0]; }).join('; ')
        : (pRes.headers.get('set-cookie') ? pRes.headers.get('set-cookie').split(';')[0] : '');

    console.log('Cookies de sesión:', cookies || 'Sin cookies');

    console.log('\n>>> 4. PROBANDO /s.php CON TODOS LOS PARÁMETROS');
    var testParams = {
        a: '1',
        tok: _t,
        rt: _qv,
        tk: _qt,
        ao: 'https://sololatino.net'
    };

    var sRes = await fetch('https://player.pelisserieshoy.com/s.php', {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://player.pelisserieshoy.com',
            'Referer': apiJson.url,
            'Cookie': cookies
        },
        body: new URLSearchParams(testParams).toString()
    });

    console.log('Status /s.php:', sRes.status);
    console.log('Respuesta:\n', await sRes.text());
})();
