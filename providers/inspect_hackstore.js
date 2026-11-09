/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 2 - Búsqueda y Frontend)
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var http = require('http');
var urlModule = require('url');

var BASE_URL = 'https://hackstore2.com';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(targetUrl, options) {
    options = options || {};
    var timeout = options.timeout || 6000;
    var startTime = Date.now();

    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var lib = parsed.protocol === 'https:' ? https : http;

        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
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
            err.code = 'ETIMEDOUT';
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

function runDeepAudit() {
    console.log('\n============================================================');
    console.log('>>> 1. INSPECCIONANDO HTML DE LA HOME EN BUSCA DE SCRIPTS Y SLUGS');
    console.log('============================================================');

    return request(BASE_URL)
        .then(function(res) {
            console.log('[HOME STATUS]: ' + res.status);
            
            // Extraer enlaces a películas/series visibles en la home
            var linkRegex = /href=["'](https?:\/\/hackstore2\.com\/(?:peliculas|series|pelicula|serie)\/[^"']+)["']/gi;
            var links = [];
            var match;
            while ((match = linkRegex.exec(res.body)) !== null) {
                if (links.indexOf(match[1]) === -1) links.push(match[1]);
            }
            
            console.log('[ENLACES DE CONTENIDO DETECTADOS EN HOME]: ' + links.length);
            for (var i = 0; i < Math.min(5, links.length); i++) {
                console.log('  -> ' + links[i]);
            }

            // Extraer rutas de bundles JS de Next.js / Nuxt / React / Vue
            var scriptRegex = /src=["']([^"']+\.js[^"']*)["']/gi;
            var scripts = [];
            while ((match = scriptRegex.exec(res.body)) !== null) {
                if (scripts.indexOf(match[1]) === -1) scripts.push(match[1]);
            }
            console.log('\n[SCRIPTS JS DETECTADOS]: ' + scripts.length);
            for (var j = 0; j < Math.min(6, scripts.length); j++) {
                console.log('  -> ' + scripts[j]);
            }

            console.log('\n============================================================');
            console.log('>>> 2. PROBANDO VARIACIONES DEL ENDPOINT DE BÚSQUEDA');
            console.log('============================================================');

            var testVariants = [
                BASE_URL + '/api/rest/search?q=matrix',
                BASE_URL + '/api/rest/search?query=matrix',
                BASE_URL + '/api/rest/search?keyword=matrix',
                BASE_URL + '/api/rest/search?s=matrix',
                BASE_URL + '/api/rest/movies?search=matrix',
                BASE_URL + '/api/rest/movies?page=1&limit=5',
                BASE_URL + '/?s=matrix'
            ];

            function tryVariant(index) {
                if (index >= testVariants.length) {
                    console.log('\n============================================================');
                    console.log('>>> FIN DEL DIAGNÓSTICO DE VARIANTES');
                    console.log('============================================================');
                    return Promise.resolve();
                }

                var target = testVariants[index];
                return request(target)
                    .then(function(r) {
                        var isJson = (r.headers['content-type'] || '').indexOf('application/json') !== -1;
                        var preview = r.body.substring(0, 150).replace(/\s+/g, ' ');
                        console.log('[' + r.status + '] ' + target + ' | JSON: ' + isJson + ' | Body: ' + preview);
                        return tryVariant(index + 1);
                    })
                    .catch(function(err) {
                        console.log('[ERROR] ' + target + ' -> ' + err.message);
                        return tryVariant(index + 1);
                    });
            }

            return tryVariant(0);
        })
        .catch(function(err) {
            console.log('[ERROR FATAL]: ' + err.message);
            if (err.cause) console.log(err.cause);
        });
}

runDeepAudit();
