/**
 * Inspección del algoritmo de descifrado en /vidurl/ y embeds en SoloLatino.
 * Ejecutar: node providers/inspect_pelispedia.js
 */

var https = require('https');
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url, referer) {
    return new Promise(function(resolve, reject) {
        https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': referer || 'https://pelispedia.mov/'
            }
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
            });
        }).on('error', reject);
    });
}

console.log('>>> 1. EXTRAYENDO FUNCIÓN DE DESCIFRADO DE pelispedia.mov/vidurl/tt0133093/');
get('https://pelispedia.mov/vidurl/tt0133093/', 'https://pelispedia.mov/pelicula/matrix')
    .then(function(res) {
        var html = res.body;
        var scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
        scripts.forEach(function(s, i) {
            if (s.indexOf('POW_CHALLENGE') !== -1 || s.indexOf('sortedEmbeds') !== -1 || s.indexOf('decrypt') !== -1 || s.indexOf('CryptoJS') !== -1 || s.indexOf('subtle') !== -1) {
                console.log('\n--- Script #' + (i + 1) + ' (' + s.length + ' chars) ---');
                // Imprimir desde donde procesa POW/decrypt hacia adelante
                var pIdx = s.indexOf('decrypt');
                if (pIdx === -1) pIdx = s.indexOf('sortedEmbeds');
                if (pIdx !== -1) {
                    console.log(s.slice(Math.max(0, pIdx - 400), Math.min(s.length, pIdx + 2200)));
                } else {
                    console.log(s.slice(0, 2200));
                }
            }
        });

        console.log('\n>>> 2. REVISANDO EMBEDS EN https://sololatino.net/peliculas/matrix/');
        return get('https://sololatino.net/peliculas/matrix/', 'https://sololatino.net/');
    })
    .then(function(sRes) {
        console.log('SoloLatino Ficha Status:', sRes.status, '| Bytes:', sRes.body.length);
        var iframes = sRes.body.match(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi) || [];
        console.log('Iframes en SoloLatino:', iframes);
        var urls = sRes.body.match(/https?:\/\/[^"'\s<>\\]*(?:embed69|xupalace|vidurl|vidhide|streamwish|hlswish|filemoon|vimeos|ok\.ru|voe)[^"'\s<>\\]*/gi) || [];
        var unique = [];
        urls.forEach(function(u) { if (unique.indexOf(u) === -1) unique.push(u); });
        console.log('URLs de reproductor en SoloLatino:', unique.slice(0, 15));
    })
    .catch(function(err) {
        console.log('Error:', err.message, err.cause || '');
    });
