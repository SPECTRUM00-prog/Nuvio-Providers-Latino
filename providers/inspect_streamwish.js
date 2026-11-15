/**
 * Diagnóstico de Mirrors y SSL para StreamWish
 * Ejecutar: node providers/inspect_streamwish.js
 */

var https = require('https');
var crypto = require('crypto');
var urlModule = require('url');

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var TEST_ID = 'ssmlcs645rjn';

function request(targetUrl, referer, maxRedirects) {
    maxRedirects = maxRedirects !== undefined ? maxRedirects : 3;
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
            timeout: 5000
        }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
                var nextUrl = res.headers.location.indexOf('http') === 0
                    ? res.headers.location
                    : (parsed.protocol + '//' + parsed.host + res.headers.location);
                return resolve(request(nextUrl, targetUrl, maxRedirects - 1));
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

function decryptPelisPediaLinks() {
    console.log('>>> 1. VIENDO URLS ORIGINALES DE STREAMWISH EN pelispedia.mov/vidurl/tt0133093/');
    return request('https://pelispedia.mov/vidurl/tt0133093/', 'https://pelispedia.mov/pelicula/matrix')
        .then(function(res) {
            var cMatch = res.body.match(/LINK_CHALLENGE\s*=\s*['"]([^'"]+)['"]/);
            var sMatch = res.body.match(/LINK_SALT\s*=\s*['"]([^'"]+)['"]/);
            var dMatch = res.body.match(/dataLink\s*=\s*(\[[\s\S]*?\])\s*;/);
            if (!cMatch || !dMatch) {
                console.log('No se encontró LINK_CHALLENGE/dataLink');
                return [];
            }
            var key = crypto.createHash('sha256').update(cMatch[1] + (sMatch ? sMatch[1] : '')).digest();
            var data = JSON.parse(dMatch[1]);
            var swUrls = [];

            data.forEach(function(file) {
                (file.sortedEmbeds || []).forEach(function(emb) {
                    if (emb.servername === 'streamwish') {
                        var raw = Buffer.from(emb.link, 'base64');
                        var iv = raw.slice(0, 16);
                        var ct = raw.slice(16);
                        var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                        var dec = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8').replace(/`/g, '').trim();
                        console.log('  [' + file.video_language + '] URL original:', dec);
                        swUrls.push(dec);
                    }
                });
            });
            return swUrls;
        })
        .catch(function(e) {
            console.log('Error leyendo PelisPedia:', e.message);
            return [];
        });
}

function probeMirrors(urls) {
    var mirrors = urls.concat([
        'https://hgcloud.to/e/' + TEST_ID,
        'https://hglink.to/e/' + TEST_ID,
        'https://streamwish.to/e/' + TEST_ID,
        'https://flaswish.com/e/' + TEST_ID,
        'https://strwish.com/e/' + TEST_ID,
        'https://vibuxer.com/e/' + TEST_ID,
        'https://playerwish.com/e/' + TEST_ID,
        'https://cybervynx.com/e/' + TEST_ID
    ]);

    var unique = [];
    mirrors.forEach(function(m) { if (unique.indexOf(m) === -1) unique.push(m); });

    console.log('\n>>> 2. PROBANDO MIRRORS DE STREAMWISH (' + unique.length + ')');
    function next(idx) {
        if (idx >= unique.length) return Promise.resolve();
        var u = unique[idx];
        return request(u, 'https://pelispedia.mov/')
            .then(function(r) {
                var hasPack = r.body.indexOf('eval(function(p,a,c,k') !== -1;
                var hasM3u8 = r.body.indexOf('.m3u8') !== -1;
                var hasCf = r.body.indexOf('cf-turnstile') !== -1 || r.body.indexOf('Just a moment') !== -1;
                console.log('  [' + r.status + '] ' + u + ' -> Final: ' + r.finalUrl + ' | Pack: ' + hasPack + ' | M3U8: ' + hasM3u8 + ' | CF: ' + hasCf);
                return next(idx + 1);
            })
            .catch(function(err) {
                var code = (err.cause && err.cause.code) || err.code || '';
                console.log('  [ERROR] ' + u + ' -> ' + err.message + (code ? ' [' + code + ']' : ''));
                return next(idx + 1);
            });
    }
    return next(0);
}

decryptPelisPediaLinks().then(probeMirrors);
