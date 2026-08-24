const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function findExactApiCall() {
    console.log("=== LEYENDO LLAMADA EXACTA EN APP.JS ===");

    try {
        const res = await fetch("https://lamovie.org/app.js", {
            headers: { "User-Agent": USER_AGENT }
        });
        const code = await res.text();

        // 1. Buscar alrededor de "cast/tvshows"
        const castIdx = code.indexOf("cast/tvshows");
        if (castIdx !== -1) {
            console.log("\n[1] Código alrededor de 'cast/tvshows':");
            console.log(code.substring(castIdx - 250, castIdx + 300));
        }

        // 2. Buscar alrededor de "player?postId="
        const playerIdx = code.indexOf("player?postId=");
        if (playerIdx !== -1) {
            console.log("\n[2] Código alrededor de 'player?postId=':");
            console.log(code.substring(playerIdx - 250, playerIdx + 300));
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

findExactApiCall();
