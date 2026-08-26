// test_voe_decryption.js
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function decodeB64(str) {
    if (!str) return null;
    try {
        let clean = str.replace(/-/g, "+").replace(/_/g, "/").trim();
        while (clean.length % 4) clean += "=";
        return Buffer.from(clean, "base64").toString("utf8");
    } catch {
        return null;
    }
}

async function run() {
    const url = "https://tracylocalschool.com/e/j6koo1mpucye";
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://voe.sx/" } });
        const html = await res.text();
        const scriptMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/i);
        if (!scriptMatch) {
            console.log("No application/json found!");
            return;
        }

        let enc = JSON.parse(scriptMatch[1].trim());
        if (Array.isArray(enc)) enc = enc[0];

        console.log("Original encoded string length:", enc.length);

        // ROT13
        let rot = enc.replace(/[a-zA-Z]/g, c => {
            const code = c.charCodeAt(0);
            const limit = c <= "Z" ? 90 : 122;
            return String.fromCharCode(limit >= code + 13 ? code + 13 : code - 13);
        });

        // Noise removal
        ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(n => {
            rot = rot.split(n).join("");
        });

        console.log("Rotated & cleaned string length:", rot.length);

        // Base64 decode
        const b64 = decodeB64(rot);
        if (!b64) {
            console.log("Failed to base64 decode!");
            return;
        }
        console.log("Base64 decoded length:", b64.length);

        // Shift -3
        let shifted = "";
        for (let i = 0; i < b64.length; i++) {
            shifted += String.fromCharCode(b64.charCodeAt(i) - 3);
        }

        // Reverse and decode Base64 again
        const reversed = shifted.split("").reverse().join("");
        const decrypted = decodeB64(reversed);
        if (!decrypted) {
            console.log("Failed to second-level base64 decode!");
            return;
        }

        console.log("Decrypted output length:", decrypted.length);
        console.log("Decrypted string starts with:", decrypted.substring(0, 300));

        const data = JSON.parse(decrypted);
        console.log("Decrypted object keys:", Object.keys(data));
        console.log("Video Source URL:", data.source || data.direct_access_url);
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
