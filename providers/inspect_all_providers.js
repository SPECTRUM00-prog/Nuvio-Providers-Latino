/**
 * Probar resolución de streams (a=click y a=2) en player.pelisserieshoy.com/s.php
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

    var _t = (pHtml.match(/const\s+_t\s*=\s*'([^']+)'/) || [])[1] || '';
    var _qc = (pHtml.match(/var\s+_qc\s*=\s*"([^"]+)"/) || [])[1] || '';
    var qkMatch = pHtml.match(/var\s+_qk\s*=\s*(\[[^\]]+\])/);
    var q9Match = pHtml.match(/function\s+_q9\s*\(\)\s*\{\s*return\s+([^;]+);/);
    var _qv = '';
    if (qkMatch && q9Match) {
        var _qk = JSON.parse(qkMatch[1]);
        _qv = q9Match[1].replace(/_qk\[(\d+)\]/g, function(_, idx) { return _qk[parseInt(idx, 10)] || ''; }).replace(/\s*\+\s*/g, '');
    }
    var _qt = fnv1a(_qv + '|clk|' + _qc);

    var cookies = typeof pRes.headers.getSetCookie === 'function'
        ? pRes.headers.getSetCookie().map(function(x) { return x.split(';')[0]; }).join('; ')
        : '';

    function postS(params) {
        params.tok = _t;
        params.rt = _qv;
        params.tk = _qt;
        params.ao = 'https://sololatino.net';
        return fetch('https://player.pelisserieshoy.com/s.php', {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://player.pelisserieshoy.com',
                'Referer': playerUrl,
                'Cookie': cookies
            },
            body: new URLSearchParams(params).toString()
        }).then(function(r) { return r.json(); });
    }

    // 1. Escanear (a=1)
    var scan = await postS({ a: '1' });
    var latList = (scan.langs_s && scan.langs_s.LAT) || scan.s || [];
    console.log('Servidores LAT:', latList);

    // 2. Enviar click (por si el servidor lo exige en sesión)
    var clk = await postS({ a: 'click', ts: '1' });
    console.log('Resultado a=click:', clk);

    // 3. Probar a=2 para cada servidor LAT
    for (var i = 0; i < latList.length; i++) {
        var label = latList[i][0];
        var idHash = latList[i][1];
        var res2 = await postS({ a: '2', v: idHash, src: scan.src || '' });
        console.log('\n[' + label + '] a=2 respuesta:', JSON.stringify(res2));

        if (res2 && res2.u) {
            // Probar si d.u funciona directo o vía /p.php
            try {
                var directChk = await fetch(res2.u, { headers: { 'User-Agent': UA } });
                console.log('  -> Directo d.u:', directChk.status, directChk.headers.get('content-type'));
            } catch (e) {
                console.log('  -> Directo d.u error:', e.message);
            }
            if (res2.sig) {
                var pxUrl = 'https://player.pelisserieshoy.com/p.php?url=' + encodeURIComponent(res2.u) + '&sig=' + encodeURIComponent(res2.sig);
                var pxChk = await fetch(pxUrl, { headers: { 'User-Agent': UA, 'Referer': playerUrl } });
                var pxTxt = await pxChk.text();
                console.log('  -> Proxy /p.php:', pxChk.status, '| #EXTM3U:', pxTxt.indexOf('#EXTM3U') !== -1);
            }
        }
    }
})();
