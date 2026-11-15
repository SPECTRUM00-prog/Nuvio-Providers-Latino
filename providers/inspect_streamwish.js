/**
 * Verificar m3u8 real dentro de playerwish.com / vibuxer.com
 * Ejecutar: node providers/inspect_streamwish.js
 */

var https = require('https');
var TEST_URLS = [
    'https://playerwish.com/e/ssmlcs645rjn',
    'https://vibuxer.com/e/ssmlcs645rjn'
];
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function unpackAll(html) {
    var re = /eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]+\)\{[\s\S]*?\}\((['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\(['"]\|['"]\)/g;
    var dict = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function dec(v, r) {
        var res = 0;
        for (var i = 0; i < v.length; i++) {
            var idx = dict.indexOf(v[i]);
            if (idx === -1) return NaN;
            res = res * r + idx;
        }
        return res;
    }
    var out = [], m;
    while ((m = re.exec(html)) !== null) {
        var a = parseInt(m[3], 10), k = m[6].split('|');
        var u = m[2].replace(/\b([0-9a-zA-Z]+)\b/g, function(t) {
            var idx = dec(t, a);
            return (!isNaN(idx) && k[idx]) ? k[idx] : t;
        });
        out.push(u.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, '/'));
    }
    return out.join('\n');
}

function get(u, ref) {
    return new Promise(function(resolve, reject) {
        var p = new URL(u);
        https.get({
            hostname: p.hostname,
            path: p.pathname + p.search,
            headers: { 'User-Agent': UA, 'Referer': ref || u }
        }, function(res) {
            var c = [];
            res.on('data', function(d) { c.push(d); });
            res.on('end', function() { resolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') }); });
        }).on('error', reject);
    });
}

(async function() {
    for (var i = 0; i < TEST_URLS.length; i++) {
        var u = TEST_URLS[i];
        try {
            var r = await get(u, 'https://pelispedia.mov/');
            var unp = unpackAll(r.body);
            var m3u8 = unp.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            console.log('\n>>> ' + u);
            console.log('  M3U8 extraído:', m3u8 ? m3u8[0] : 'NO ENCONTRADO');
            if (m3u8) {
                var chk = await get(m3u8[0], u);
                console.log('  Validación M3U8:', chk.status, '| #EXTM3U:', chk.body.indexOf('#EXTM3U') !== -1);
            }
        } catch (e) {
            console.log('>>> ' + u + ' ERROR:', e.message);
        }
    }
})();
