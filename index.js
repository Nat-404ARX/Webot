const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const targetUrl = "https://"; //Entrer l'URL ici
const outputBaseDir = path.join(__dirname, `images_telechargees/${targetUrl.slice(8)}`);

if (!fs.existsSync(outputBaseDir)) {
    fs.mkdirSync(outputBaseDir, { recursive: true });
}

async function downloadImage(fileUrl, outputFolder) {
    try {
        const response = await axios({
            url: fileUrl,
            method: 'GET',
            responseType: 'stream'
        });

        const parsedUrl = new URL(fileUrl);
        let filename = path.basename(parsedUrl.pathname);
        if (!filename || !filename.includes('.')) {
            filename = `image_${Date.now()}.jpg`;
        }

        const filePath = path.join(outputFolder, filename);
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`Erreur de téléchargement pour ${fileUrl}:`, error.message);
    }
}


const visitedPages = new Set();
const pagesQueue = [];

async function scrapePage(pageUrl) {
    if (visitedPages.has(pageUrl)) return;
    visitedPages.add(pageUrl);

    try {
        console.log(`\n--- Exploration de la page [${visitedPages.size} visitées] : ${pageUrl} ---`);
        const { data: html } = await axios.get(pageUrl);
        const $ = cheerio.load(html);

        const parsedUrl = new URL(pageUrl);
        let pageFolderName = parsedUrl.pathname.replace(/[^a-zA-Z0-9]/g, '_');
        if (pageFolderName === '' || pageFolderName === '_') {
            pageFolderName = 'accueil';
        }
        const pageOutputDir = path.join(outputBaseDir, pageFolderName);

        if (!fs.existsSync(pageOutputDir)) {
            fs.mkdirSync(pageOutputDir, { recursive: true });
        }

        const imageUrls = new Set();

        $('img').each((i, element) => {
            let imgUrl = $(element).attr('src');
            if (!imgUrl) {
                imgUrl = $(element).attr('data-src');
            }
            if (imgUrl) {
                try {
                    const absoluteUrl = new URL(imgUrl, pageUrl).href;
                    imageUrls.add(absoluteUrl);
                } catch (e) {
                }
            }
        });

        console.log(`-> ${imageUrls.size} images trouvées sur cette page. Téléchargement...`);
        for (const imgUrl of imageUrls) {
            await downloadImage(imgUrl, pageOutputDir);
        }

        $('a').each((i, element) => {
            let href = $(element).attr('href');
            if (href) {
                try {
                    const absoluteLink = new URL(href, pageUrl).href;
                    const linkParsed = new URL(absoluteLink);

                    const isSameDomain = linkParsed.hostname === parsedUrl.hostname;
                    const isHtmlPage = !/\.(pdf|zip|mp4|mp3|png|jpg|jpeg|gif|svg)$/i.test(linkParsed.pathname);

                    if (isSameDomain && isHtmlPage && !visitedPages.has(absoluteLink) && !pagesQueue.includes(absoluteLink)) {
                        pagesQueue.push(absoluteLink);
                    }
                } catch (e) {
                }
            }
        });

    } catch (error) {
        console.error(`Erreur lors du scraping de ${pageUrl}:`, error.message);
    }
}

async function run() {
    pagesQueue.push(targetUrl);

    while (pagesQueue.length > 0 && visitedPages.size < 50) {
      const currentPageUrl = pagesQueue.shift();
      await scrapePage(currentPageUrl);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\nExploration terminée ! Total de pages visitées : ${visitedPages.size}`);
}

run();
