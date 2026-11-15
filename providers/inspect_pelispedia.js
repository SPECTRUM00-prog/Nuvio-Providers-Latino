/**
 * Verificación de /vidurl/ en PelisPedia y rutas de ficha en SoloLatino.
 * Ejecutar: node providers/inspect_pelispedia.js
 */

var https = require('https');
var urlModule = require('url');

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, referer) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': referer || (parsed.protocol + '//' + parsed.host + '/')
            },
            timeout: 7000
        }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                var nextUrl = res.headers.location.indexOf('http') === 0
                    ? res.headers.location
                    : (parsed.protocol + '//' + parsed.host + res.headers.location);
                console.log('   [302/301] -> ' + nextUrl);
                return resolve(request(nextUrl, targetUrl));
            }
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    finalUrl: targetUrl,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
        });
        req.on('timeout', function() { req.destroy(); reject(new Error('TIMEOUT')); });
        req.on('error', reject);
        req.end();
    });
}

function run() {
    console.log('>>> 1. SIGUIENDO https://pelispedia.mov/vidurl/tt0133093/');
    return request('https://pelispedia.mov/vidurl/tt0133093/', 'https://pelispedia.mov/pelicula/matrix')
        .then(function(res) {
            console.log('[VIDURL STATUS]:', res.status, '| Final:', res.finalUrl, '| Bytes:', res.body.length);
            var urls = res.body.match(/https?:\/\/[^"'\s<>\\]+/gi) || [];
            var clean = [];
            urls.forEach(function(u) {
                if (clean.indexOf(u) === -1 && u.indexOf('w3.org') === -1 && u.indexOf('googleapis') === -1) clean.push(u);
            });
            console.log('[URLS EN /vidurl/]:', clean.slice(0, 15));
            if (clean.length === 0 || res.body.length < 2500) {
                console.log('[BODY SNIPPET]:\n' + res.body.slice(0, 1200));
            }
        })
        .catch(function(err) {
            console.log('[VIDURL ERROR]:', err.message, err.cause || '');
        })
        .then(function() {
            console.log('\n>>> 2. RASTREANDO ENLACES DE MATRIX EN SOLOLATINO');
            return request('https://sololatino.net/?s=matrix');
        })
        .then(function(sRes) {
            var m, allLinks = [];
            var hrefRegex = /href=["'](https?:\/\/sololatino\.net\/[^"']*matrix[^"']*)["']/gi;
            while ((m = hrefRegex.exec(sRes.body)) !== null) {
                if (allLinks.indexOf(m[1]) === -1) allLinks.push(m[1]);
            }
            console.log('[ENLACES CON "matrix" EN SOLOLATINO]:', allLinks.slice(0, 8));

            if (allLinks.length > 0) {
                return request(allLinks[0], 'https://sololatino.net/').then(function(mRes) {
                    console.log('[FICHA SOLOLATINO STATUS]:', mRes.status, '| Bytes:', mRes.body.length);
                    var iframes = mRes.body.match(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi) || [];
                    console.log('[IFRAMES EN FICHA SOLOLATINO]:', iframes);
                    var embedUrls = mRes.body.match(/https?:\/\/[^"'\s<>\\]*(?:embed69|xupalace|vidhide|streamwish|hlswish|filemoon|vimeos|ok\.ru|voe|dood|player)[^"'\s<>\\]*/gi) || [];
                    var u = [];
                    embedUrls.forEach(function(x) { if (u.indexOf(x) === -1) u.push(x); });
                    console.log('[URLS EMBED EN SOLOLATINO]:', u.slice(0, 12));
                });
            }
        })
        .catch(function(err) {
            console.log('[SOLOLATINO ERROR]:', err.message, err.cause || '');
        });
}

run();
