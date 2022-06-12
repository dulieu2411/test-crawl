const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");
puppeteer.use(AdblockerPlugin());
const { Cluster } = require("puppeteer-cluster");
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./client-secret.json')
const axios = require('axios');
var http = require('http');

http.createServer(function (req, res) {
  res.write('Hello World!'); //write a response to the client
  res.end(); //end the response
}).listen(8080);

function startKeepAlive() {
  setInterval(function() {
    axios
    .get('https://popputeer.herokuapp.com/')
    .then(res => {
      console.success(`Send request for alive`);
    })
    .catch(error => {
      console.error(`Can't send request for alive`);
    });
  }, 60 * 1000); // load every 20 minutes
}


const getLinkVideo = async (urlPage, itemInfor, itemOrder, itemCount) => {
  // Create a cluster with 2 workers
  let cluster;
  try {
     cluster = await Cluster.launch({
      puppeteer,
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 2,
      monitor: true,
      puppeteerOptions: {
        headless: true,
        args: ['--no-sandbox','--disable-setuid-sandbox'],
        // executablePath:
        //   "/usr/bin/google-chrome"
      },
    });
  } catch {
    return;
  }

  let srcs = [];
  let title = null;
  let description = '';
  let tags = [];
  let categories = [];
  // Define a task (in this case: screenshot of page)
  await cluster.task(async ({ page, data: { url, pageNum } }) => {
    await page.goto(`${url}/?tape=${pageNum}`)

    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector(
        ".container .player iframe",
        { timeout: 10000 }
      );
    } catch {
      // console.error("Không có element");
    }

    let src = await page.evaluate(() => {
      let videoSrc = null;
      try {
        videoSrc = document
          .querySelector(".container .player iframe")
          .getAttribute("src");
      } catch {}
      return videoSrc;
    });
    if (src) {
      srcs.push(src);
    }

    if (pageNum !== 1) return;

    description = await page.evaluate(() => {
      let desc = '';
      try {
        desc = document.querySelector('.post-entry').innerHTML;
        return desc;
      } catch (error) {
        return [];
      }
    })
  
    categories = await page.evaluate(() => {
      let desc = '';
      try {
        let _categories = document.querySelectorAll('.video-details .meta:nth-child(3) a');
        return Array.from(_categories).map(item => item.textContent);
      } catch (error) {
        return [];
      }
    })
  
    tags = await page.evaluate(() => {
      let tags = '';
      try {
        let _tags = document.querySelectorAll('.video-details .meta:nth-child(4) a');
        return Array.from(_tags).map(item => item.textContent);
      } catch (error) {
        return '';
      }
    })

    return;
  });


  let url = urlPage;
  // Add some pages to queue
  Array.from(Array(2).keys()).forEach((index) => {
    cluster.queue({ url, pageNum: index + 1 });
  });

  // Shutdown after everything is done
  await cluster.idle();
  console.log("XXX srcs", srcs);
  console.log("XXX headerTitle", title);
  console.log("XXX categories", categories);
  console.log("XXX tags", tags);
  const main = await mainSheet.addRow({ 
    'code': 'code',
    'Title': itemInfor.title,
    'Original Link': itemInfor.href,
    'Thumbnail': itemInfor.thumbnail,
    'Video Source': srcs.reduce((prev, src) => {
      prev += `${src}\n`;
      return prev;
    },``),
    'Maker': '',
    'Actress': '',
    'Decription': description,
    'Categories': categories.reduce((prev, cate) => {
      prev += `${cate}\n`;
      return prev;
    },``),
    'Tags': tags.reduce((prev, tag) => {
      prev += `${tag}\n`;
      return prev;
    },``)
});
  statusSheet.addRow({
    'Status': `done ${itemOrder}/${itemCount}`,
    'Time': `${new Date().toLocaleString('en-US')}`
  })

  await cluster.close();
};

const test = async (pageCategory, itemStart) => {
  let link = pageCategory;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox'],
    // executablePath:
    //   "/usr/bin/google-chrome"
  });
  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 720 });
  await page.goto(link);

  await page.waitForSelector(".video-section .item", {
    timeout: 10000,
  });
  let itemDomList = await page.$$(".video-section .item");
  console.log(Array.from(itemDomList).length);
  let items = [];
  for (index = 0; index < Array.from(itemDomList).length; index++) {
    let itemDom = itemDomList[index];
    const item = await page.evaluate((element) => {
      let thumbnail = element
        .querySelector(".item-img img")
        .getAttribute("src");
      let href = element.querySelector("a").getAttribute("href");
      let title = element.querySelector("h3 a").textContent;
      return {
        thumbnail,
        href,
        title,
      };
    }, itemDom);
    console.log(item);
    items.push(item);
  }
  // await page.waitForTimeout(24000);

  await browser.close();

  for (let index = itemStart; index < items.length; index++) {
    position.value = index + 1;
    await currentState.saveUpdatedCells();
    const item = items[index];
    await getLinkVideo(`${item.href}`, item, index + 1, items.length);
  }
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const pagePagination = async () => {
  const doc = new GoogleSpreadsheet('1zyAjFzQ7iYUyGRa7yO_svdg8b6E6YRzT1zaMriFzBVo');
await doc.useServiceAccountAuth({
    client_email: creds.client_email,
    private_key: creds.private_key,
});
await doc.loadInfo();
  mainSheet = doc.sheetsByIndex[0];
  statusSheet = doc.sheetsByIndex[1];
  currentState = doc.sheetsByIndex[2];
  restartLog = doc.sheetsByIndex[3];
  
  // let currentStateData = (await currentState.getRows() || [])[0];
  await currentState.loadCells('A1:E10');
  position = currentState.getCell(1, 0);
  pages = currentState.getCell(1, 1);
  console.log('XXX', position.value);
  console.log('XXX', pages.value);
  await restartLog.addRow({'Time': `${new Date().toLocaleString('en-US')}`});
  let pagesStart = pages.value + 1;
  // position.value = position.value + 1
  // pages.value = pages.value + 1
  // await currentState.saveUpdatedCells();
  let numberPage = 818;  
  for (let index = pages.value; index < 818; index++) {
    await sleep(1000);
    pages.value = index + 1;
    await currentState.saveUpdatedCells();
    console.warn(`======================>start get data page ${index + 1}<======================`);
    statusSheet.addRow({
      'Status': `Start crawl page ${index+1}/${numberPage}`,
      'Time': `${new Date().toLocaleString('en-US')}`
    })
    let itemStart = pagesStart == pages.value ? position.value : 0;
    await test(`https://javhd.icu/categories/censored/page/${index + 1}`, itemStart);
  }
};

let mainSheet;
let statusSheet;
let currentState;
let restartLog;
let position;
let pages;
pagePagination();
startKeepAlive();
