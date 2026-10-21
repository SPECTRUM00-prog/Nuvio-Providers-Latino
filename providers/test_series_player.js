/**
 * Test de series en FastApi (LaMovie / Cinecalidad)
 * Ejecución: node providers/test_series_player.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT, "Referer": "https://lamovie.org/" };

console.log("=======================================================");
console.log(">>> BUSCANDO SERIE EN FASTAPI <<<");
console.log("=======================================================");

fetch("https://lamovie.org/wp-api/v1/search?q=the+last+of+us", { headers: headers })
.then(function(r) { return r.json(); })
.then(function(searchRes) {
    var seriesPost = null;
    var posts = (searchRes.data && searchRes.data.posts) || [];
    for (var i = 0; i < posts.length; i++) {
        if (posts[i].type === "tvshows" || posts[i].type === "series") {
            seriesPost = posts[i];
            break;
        }
    }

    if (!seriesPost) seriesPost = posts[0];
    console.log("[+] Serie encontrada:", seriesPost.title, "| _id:", seriesPost._id, "| type:", seriesPost.type);

    var sId = seriesPost._id;

    var tests = [
        { name: "season + episode", url: "https://lamovie.org/wp-api/v1/player?postId=" + sId + "&season=1&episode=1&demo=0" },
        { name: "s + e", url: "https://lamovie.org/wp-api/v1/player?postId=" + sId + "&s=1&e=1&demo=0" },
        { name: "wpf/v1/episodes", url: "https://lamovie.org/wp-json/wpf/v1/episodes?postId=" + sId + "&season=1" },
        { name: "fastApi episodes", url: "https://lamovie.org/wp-api/v1/episodes?postId=" + sId + "&season=1" }
    ];

    function runNext(idx) {
        if (idx >= tests.length) return;
        var t = tests[idx];
        fetch(t.url, { headers: headers })
        .then(function(res) {
            return res.text().then(function(txt) {
                console.log("\n[" + res.status + "] Probando: " + t.name);
                console.log("URL: " + t.url);
                console.log("Muestra: " + txt.substring(0, 200).replace(/\r?\n\s*/g, " ") + "...");
                runNext(idx + 1);
            });
        })
        .catch(function(err) {
            console.log("[-] Error en " + t.name + ":", err.message);
            runNext(idx + 1);
        });
    }

    runNext(0);
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
