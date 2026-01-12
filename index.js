const { app, BrowserWindow, Menu } = require("electron");
const RPC = require("discord-rpc");

const clientId = "1460230200288743598"; // .env / config.json is lehetne de ez csak egy gyorstalpalo
const client = new RPC.Client({ transport: "ipc" });

let mainWindow;
let lastStatusUrl = "";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "OniAnime Desktop",
    backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.insertCSS(`
      iframe, .ad-banner, .ads-container, ins.adsbygoogle, div[class*="ad-"], #disqus_thread {
        display: none !important;
        pointer-events: none !important;
      }
    `); // premium szolgaltatas frfr - vedd ki az iframet ha akarsz latni trailereket, etc
    updateDiscordStatus();
  });

  mainWindow.loadURL("https://onianime.hu");

  setInterval(updateDiscordStatus, 5000);
}

async function fetchAnilist(id) {
  const query = `query ($id: Int) { Media (id: $id, type: ANIME) { title { romaji english } coverImage { extraLarge } } }`;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { id } }),
    });
    const json = await res.json();
    return json.data?.Media;
  } catch {
    return null;
  }
}

async function updateDiscordStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const url = mainWindow.webContents.getURL();
  if (url === lastStatusUrl) return;

  const isWatch = url.includes("/watch/");
  const isInfo = url.includes("/info/");

  if (!isWatch && !isInfo) {
    lastStatusUrl = url;
    client.clearActivity().catch(() => {});
    return;
  }

  try {
    const metaData = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const ogImage = document.querySelector('meta[property="og:image"]')?.content || "";
        const match = ogImage.match(/media\\/(\\d+)/);
        return match ? match[1] : null;
      })()
    `);

    if (!metaData) return;

    const anime = await fetchAnilist(parseInt(metaData));
    if (!anime) return;

    lastStatusUrl = url;
    const title = anime.title.english || anime.title.romaji;
    const subTitle = isWatch
      ? `${anime.title.romaji} | Epizód: ${url.split("/").pop()}`
      : `${anime.title.romaji} | Információt néz`;

    client.setActivity({
      details: title,
      state: subTitle,
      largeImageKey: anime.coverImage.extraLarge,
      largeImageText: title,
      instance: false,
      buttons: [{ label: "Nézd az OniAnimén", url: url }],
    });
  } catch (e) {
    console.error("RPC Sync Error:", e);
  }
}

client.on("ready", () => {
  createWindow();
});

app.whenReady().then(() => {
  client.login({ clientId }).catch(createWindow);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit(); // lol
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

