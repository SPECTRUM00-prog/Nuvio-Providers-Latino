/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 6 - Descubrimiento de Series)
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://hackstore2.com';
var API_URL = BASE_URL + '/api/rest';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(targetUrl) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'Referer': BASE_URL + '/',
                'Origin': BASE_URL
            },
            timeout: 6000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                var body = Buffer.concat(chunks).toString('utf8');
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch(e) {
                    resolve({ status: res.statusCode, raw: body });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runPhase6() {
    console.log('\n============================================================');
    console.log('>>> PROBANDO VARIACIONES DE post_type PARA SERIES');
    console.log('============================================================');

    var postTypes = ['series', 'serie', 'tv', 'tvshows', 'episodes', 'episode'];
    var query = 'thrones'; // Game of Thrones

    function tryType(idx) {
        if (idx >= postTypes.length) return Promise.resolve();
        var type = postTypes[idx];
        var u = API_URL + '/search?post_type=' + type + '&query=' + query;

        return request(u).then(function(res) {
            var posts = (res.data && res.data.data && res.data.data.posts) || [];
            console.log('[' + type + '] Status: ' + res.status + ' | Posts encontrados: ' + posts.length);
            if (posts.length > 0) {
                console.log('  -> Muestra: ' + posts[0].title + ' (ID: ' + posts[0]._id + ' | slug: ' + (posts[0].slug || posts[0].post_name) + ')');
            }
            return tryType(idx + 1);
        }).catch(function(err) {
            console.log('[' + type + ' ERROR]: ' + err.message);
            return tryType(idx + 1);
        });
    }

    return tryType(0).then(function() {
        console.log('\n============================================================');
        console.log('>>> INSPECCIONANDO BUNDLE Episodes-2cb1c73a.js');
        console.log('============================================================');
        var epBundleUrl = 'https://hackstore2.com/wp-content/themes/hackstore/assets/build/assets/Episodes-2cb1c73a.js';
        return request(epBundleUrl).then(function(res) {
            if (res.raw) {
                console.log('[EPISODES BUNDLE STATUS]: ' + res.status + ' (' + res.raw.length + ' bytes)');
                
                // Buscar llamadas de API en el bundle de episodios
                var matchApi = res.raw.match(/apiPath:\s*["']([^"']+)["']/g);
                if (matchApi) {
                    console.log('apiPaths detectados en Episodes:', matchApi);
                }

                // Buscar post_type en el bundle de episodios
                var matchType = res.raw.match(/post_type:\s*["']?([a-zA-Z0-9_-]+)["']?/g);
                if (matchType) {
                    console.log('post_types detectados en Episodes:', matchType);
                }
            }
        });
    });
}

runPhase6();
