/**
 * Auditoría de Búsqueda y Reproductores en SoloLatino
 * Ejecutar: node providers/inspect_all_providers.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://sololatino.net';
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
                'Referer': referer || BASE_URL + '/'
            },
            timeout: 7000
        }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                var nextUrl = res.headers.location.indexOf('http') === 0
                    ? res.headers.location
                    : (parsed.protocol + '//' + parsed.host + res.headers.location);
                return resolve(request(nextUrl, targetUrl));
            }
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({ status: res.statusCode, finalUrl: targetUrl, body: Buffer.concat(chunks).toString('utf8') });
            });
        });
        req.on('timeout', function() { req.destroy(); reject(new Error('TIMEOUT')); });
        req.on('error', reject);
        req.end();
    });
}

function run() {
    console.log('>>> 1. PROBANDO ENDPOINTS DE BÚSQUEDA EN sololatino.net');
    var tests = [
        BASE_URL + '/?s=matrix',
        BASE_URL + '/search/matrix',
        BASE_URL + '/wp-json/wp/v2/posts?search=matrix',
        BASE_URL + '/pelicula/matrix',
        BASE_URL + '/peliculas/matrix'
    ];

    function tryTest(i) {
        if (i >= tests.length) return Promise.resolve();
        var u = tests[i];
        return request(u).then(function(r) {
            var hasMatrix = r.body.toLowerCase().indexOf('matrix') !== -1;
            console.log('  [' + r.status + '] ' + u + ' | Final: ' + r.finalUrl + ' | Bytes: ' + r.body.length + ' | Tiene "matrix": ' + hasMatrix);
            return tryTest(i + 1);
        }).catch(function(e) {
            console.log('  [ERROR] ' + u + ' -> ' + e.message, e.cause || '');
            return tryTest(i + 1);
        });
    }

    return tryTest(0).then(function() {
        console.log('\n>>> 2. INSPECCIONANDO UNA FICHA REAL DE SOLOLATINO');
        // Tomamos una ficha real detectada en su HTML anterior
        return request(BASE_URL + '/pelicula/mary-and-max');
    }).then(function(r) {
        console.log('  [FICHA STATUS]:', r.status, '| Bytes:', r.body.length);
        var iframes = r.body.match(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi) || [];
        console.log('  [IFRAMES EN FICHA]:', iframes);

        var dataAttrs = r.body.match(/(?:data-url|data-embed|data-src|data-post|data-nume|data-type)=["']([^"']+)["']/gi) || [];
        console.log('  [ATRIBUTOS DATA-*]:', dataAttrs.slice(0, 12));

        var embeds = r.body.match(/https?:\/\/[^"'\s<>\\]*(?:embed69|xupalace|vidhide|streamwish|hlswish|hglink|hgcloud|filemoon|vimeos|ok\.ru|voe|dood|admin-ajax)[^"'\s<>\\]*/gi) || [];
        var uniq = [];
        embeds.forEach(function(x) { if (uniq.indexOf(x) === -1) uniq.push(x); });
        console.log('  [URLS DE REPRODUCTOR / AJAX DETECTADAS]:', uniq.slice(0, 15));
    }).catch(function(e) {
        console.log('  [ERROR FICHA]:', e.message, e.cause || '');
    });
}

run();
