/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 3 - Reverse del Bundle y POST)
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var http = require('http');
var urlModule = require('url');

var BASE_URL = 'https://hackstore2.com';
var BUNDLE_URL = 'https://hackstore2.com/wp-content/themes/hackstore/assets/build/assets/index-8f03e130.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(targetUrl, options) {
    options = options || {};
    var timeout = options.timeout || 8000;
    var startTime = Date.now();

    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var lib = parsed.protocol === 'https:' ? https : http;

        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
            'Referer': BASE_URL + '/',
            'Origin': BASE_URL
        }, options.headers || {});

        var req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.path,
            method: options.method || 'GET',
            headers: reqHeaders,
            timeout: timeout
        }, function(res) {
            var chunks = [];
            res.on('data', function(chunk) { chunks.push(chunk); });
            res.on('end', function() {
                var elapsed = Date.now() - startTime;
                var body = Buffer.concat(chunks).toString('utf8');
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    elapsed: elapsed,
                    body: body
                });
            });
        });

        req.on('timeout', function() {
            req.destroy();
            var err = new Error('ETIMEDOUT tras ' + timeout + 'ms');
            reject(err);
        });

        req.on('error', function(err) {
            reject(err);
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

function runAuditPhase3() {
    console.log('\n============================================================');
    console.log('>>> 1. SIGUIENDO REDIRECCIÓN 302 DE /?s=matrix');
    console.log('============================================================');

    return request(BASE_URL + '/?s=matrix')
        .then(function(res) {
            console.log('[302 REDIRECT LOCATION]: ' + res.headers.location);
            if (res.headers.location) {
                var loc = res.headers.location.indexOf('http') === 0 ? res.headers.location : (BASE_URL + res.headers.location);
                return request(loc).then(function(locRes) {
                    console.log('[DESTINO STATUS]: ' + locRes.status + ' para ' + loc);
                    console.log('[DESTINO PREVIEW]: ' + locRes.body.substring(0, 200).replace(/\s+/g, ' '));
                });
            }
        })
        .then(function() {
            console.log('\n============================================================');
            console.log('>>> 2. PROBANDO /api/rest/search CON POST Y CABECERAS AJAX');
            console.log('============================================================');

            var postTests = [
                // GET con X-Requested-With
                { method: 'GET', url: BASE_URL + '/api/rest/search?q=matrix', headers: { 'X-Requested-With': 'XMLHttpRequest' } },
                // POST JSON
                { method: 'POST', url: BASE_URL + '/api/rest/search', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ q: 'matrix' }) },
                { method: 'POST', url: BASE_URL + '/api/rest/search', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'matrix' }) },
                // POST Form URL Encoded
                { method: 'POST', url: BASE_URL + '/api/rest/search', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'q=matrix' }
            ];

            function tryPost(idx) {
                if (idx >= postTests.length) return Promise.resolve();
                var t = postTests[idx];
                return request(t.url, t)
                    .then(function(r) {
                        console.log('[' + t.method + '] Status: ' + r.status + ' | Body: ' + r.body.substring(0, 180));
                        return tryPost(idx + 1);
                    })
                    .catch(function(err) {
                        console.log('[' + t.method + ' ERROR]: ' + err.message);
                        return tryPost(idx + 1);
                    });
            }

            return tryPost(0);
        })
        .then(function() {
            console.log('\n============================================================');
            console.log('>>> 3. DESCARGANDO E INSPECCIONANDO BUNDLE FRONTEND JS');
            console.log('============================================================');

            return request(BUNDLE_URL).then(function(res) {
                console.log('[BUNDLE STATUS]: ' + res.status + ' (' + res.body.length + ' bytes)');
                
                // Buscar ocurrencias de api/rest
                var regexApi = /["']([^"']*\/api\/rest\/[^"']*)["']/g;
                var apis = [];
                var m;
                while ((m = regexApi.exec(res.body)) !== null) {
                    if (apis.indexOf(m[1]) === -1) apis.push(m[1]);
                }
                console.log('\n[ENDPOINTS /api/rest DETECTADOS EN EL BUNDLE]:');
                apis.forEach(function(a) { console.log('  -> ' + a); });

                // Buscar cómo se llama a search
                var searchContextIdx = res.body.indexOf('/search');
                if (searchContextIdx !== -1) {
                    var snippet = res.body.substring(Math.max(0, searchContextIdx - 100), Math.min(res.body.length, searchContextIdx + 200));
                    console.log('\n[CONTEXTO DE /search EN EL CÓDIGO JS]:');
                    console.log(snippet.replace(/\s+/g, ' '));
                }

                // Buscar cabeceras personalizadas en peticiones axios/fetch
                var headerMatches = res.body.match(/headers:\s*\{[^}]+\}/g);
                if (headerMatches) {
                    console.log('\n[CABECERAS ENCONTRADAS EN LLAMADAS HTTP]:');
                    headerMatches.slice(0, 5).forEach(function(h) { console.log('  -> ' + h); });
                }
            });
        })
        .catch(function(err) {
            console.log('[ERROR]: ' + err.message);
        });
}

runAuditPhase3();
