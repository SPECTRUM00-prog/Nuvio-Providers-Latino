/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 4 - Validación de fastApi y query)
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
            reject(new Error('ETIMEDOUT tras ' + timeout + 'ms'));
        });

        req.on('error', function(err) {
            reject(err);
        });

        req.end();
    });
}

function runAuditPhase4() {
    console.log('\n============================================================');
    console.log('>>> 1. PROBANDO PARÁMETROS DESCUBIERTOS (query + post_type)');
    console.log('============================================================');

    var testUrls = [
        BASE_URL + '/api/rest/search?post_type=movies&query=matrix',
        BASE_URL + '/api/rest/search?post_type=all&query=matrix',
        BASE_URL + '/api/rest/search?query=matrix&post_type=movies',
        BASE_URL + '/api/fast/search?post_type=movies&query=matrix',
        BASE_URL + '/api/search?post_type=movies&query=matrix'
    ];

    function trySearch(idx) {
        if (idx >= testUrls.length) return Promise.resolve();
        var u = testUrls[idx];
        return request(u)
            .then(function(res) {
                console.log('[' + res.status + '] (' + res.elapsed + 'ms) ' + u);
                console.log('    Body: ' + res.body.substring(0, 200).replace(/\s+/g, ' '));
                return trySearch(idx + 1);
            })
            .catch(function(err) {
                console.log('[ERROR] ' + u + ' -> ' + err.message);
                return trySearch(idx + 1);
            });
    }

    return trySearch(0)
        .then(function() {
            console.log('\n============================================================');
            console.log('>>> 2. INSPECCIONANDO CONSTRUCCIÓN DE fastApi EN EL JS');
            console.log('============================================================');

            return request(BUNDLE_URL).then(function(res) {
                var fastApiIdx = res.body.indexOf('fastApi');
                while (fastApiIdx !== -1) {
                    var snippet = res.body.substring(Math.max(0, fastApiIdx - 80), Math.min(res.body.length, fastApiIdx + 160));
                    console.log('Fragmento fastApi: ' + snippet.replace(/\s+/g, ' '));
                    fastApiIdx = res.body.indexOf('fastApi', fastApiIdx + 1);
                }

                // Buscar definiciones de baseURL / apiBase / axios.create
                var apiBaseIdx = res.body.indexOf('/api/');
                while (apiBaseIdx !== -1) {
                    var snippetApi = res.body.substring(Math.max(0, apiBaseIdx - 50), Math.min(res.body.length, apiBaseIdx + 100));
                    console.log('Fragmento /api/: ' + snippetApi.replace(/\s+/g, ' '));
                    apiBaseIdx = res.body.indexOf('/api/', apiBaseIdx + 1);
                }
            });
        });
}

runAuditPhase4();
