const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");
puppeteer.use(AdblockerPlugin());
const { Cluster } = require("puppeteer-cluster");
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./client-secret.json')
var http = require('http');

function startKeepAlive() {
  setInterval(function() {
      var options = {
          host: 'your_app_name.herokuapp.com',
          port: process.env.PORT || 6000,
          path: '/'
      };
      http.get(options, function(res) {
          res.on('data', function(chunk) {
              try {
                  // optional logging... disable after it's working
                  console.log("HEROKU RESPONSE: " + chunk);
              } catch (err) {
                  console.log(err.message);
              }
          });
      }).on('error', function(err) {
          console.log("Error: " + err.message);
      });
  }, 20 * 60 * 1000); // load every 20 minutes
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

const test = async (pageCategory) => {
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

  for (let index = 0; index < items.length; index++) {
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
  const doc = new GoogleSpreadsheet('1BUY02K7hGe-J2WI-AdcOen0PJqk_N3-kRidNixDuOvc');
await doc.useServiceAccountAuth({
    client_email: creds.client_email,
    private_key: creds.private_key,
});
await doc.loadInfo();
  mainSheet = doc.sheetsByIndex[0];
  statusSheet = doc.sheetsByIndex[1];
  let numberPage = 818;
  for (let index = 300; index < 818; index++) {
    await sleep(1000);
    console.warn(`======================>start get data page ${index}<======================`);
    statusSheet.addRow({
      'Status': `Start crawl page ${index+1}/${numberPage}`,
      'Time': `${new Date().toLocaleString('en-US')}`
    })
    await test(`https://javhd.icu/categories/censored/page/${index + 1}`);
  }
};

let mainSheet;
let statusSheet
pagePagination();
startKeepAlive();
