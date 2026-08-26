// inspect_voe_redirect.js
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function run() {
    const url = "https://tracylocalschool.com/e/j6koo1mpucye";
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://voe.sx/" } });
        console.log("Status:", res.status);
        const html = await res.text();
        console.log("HTML length:", html.length);
        
        // Let's search for json blocks or specific scripts
        const scriptJsonMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/i);
        if (scriptJsonMatch) {
            console.log("Found script application/json!");
            console.log(scriptJsonMatch[1].substring(0, 500) + "...");
        } else {
            console.log("No application/json script found.");
            // Print scripts that look interesting
            const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
            for (let s of scripts) {
                if (s.includes("hls") || s.includes("sources") || s.includes("window.voe") || s.includes("wc-voe") || s.includes("setup")) {
                    console.log("\n--- SCRIPT ---");
                    console.log(s.substring(0, 1000));
                }
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
