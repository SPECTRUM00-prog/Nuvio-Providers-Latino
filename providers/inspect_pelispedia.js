/**
 * Inspección de dataLink/PoW dentro de pelispedia.mov/vidurl/ y enlaces relativos de SoloLatino
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
                return resolve(request(nextUrl, targetUrl));
            }
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
            });
        });
        req.on('timeout', function() { req.destroy(); reject(new Error('TIMEOUT')); });
        req.on('error', reject);
        req.end();
    });
}

function run() {
    console.log('>>> 1. INSPECCIONANDO SCRIPT DE VIDEO EN pelispedia.mov/vidurl/tt0133093/');
    return request('https://pelispedia.mov/vidurl/tt0133093/', 'https://pelispedia.mov/pelicula/matrix')
        .then(function(res) {
            var html = res.body;
            console.log('¿Tiene POW_CHALLENGE?:', html.indexOf('POW_CHALLENGE') !== -1);
            console.log('¿Tiene dataLink?:', html.indexOf('dataLink') !== -1);
            console.log('¿Tiene decrypt/AES?:', html.indexOf('decrypt') !== -1 || html.indexOf('AES') !== -1 || html.indexOf('CryptoJS') !== -1);

            var dlIdx = html.indexOf('dataLink');
            if (dlIdx !== -1) {
                console.log('\n[CONTEXTO DE dataLink]:');
                console.log(html.slice(Math.max(0, dlIdx - 120), dlIdx + 700));
            }

            var powIdx = html.indexOf('POW_CHALLENGE');
            if (powIdx !== -1) {
                console.log('\n[CONTEXTO DE POW]:');
                console.log(html.slice(Math.max(0, powIdx - 50), powIdx + 450));
            }

            // Buscar también función de descifrado en el script
            var decIdx = html.indexOf('decrypt');
            if (decIdx !== -1) {
                console.log('\n[CONTEXTO DE decrypt]:');
                console.log(html.slice(Math.max(0, decIdx - 80), decIdx + 450));
            }
        })
        .then(function() {
            console.log('\n>>> 2. RASTREANDO ENLACES RELATIVOS EN SOLOLATINO (?s=matrix)');
            return request('https://sololatino.net/?s=matrix');
        })
        .then(function(sRes) {
            var m, links = [];
            var r = /href=["']([^"']*matrix[^"']*)["']/gi;
            while ((m = r.exec(sRes.body)) !== null) {
                if (links.indexOf(m[1]) === -1) links.push(m[1]);
            }
            console.log('[ENLACES EN SOLOLATINO]:', links.slice(0, 8));
        })
        .catch(function(e) {
            console.log('Error:', e.message);
        });
}

run();
