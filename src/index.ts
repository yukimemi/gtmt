import { Command, flags } from "@oclif/command";
import { WebAPICallResult, WebClient } from "@slack/web-api";
import Color from "color";
import fs from "fs";
import * as _ from "lodash";
import moment from "moment-timezone";
import puppeteer from "puppeteer";
import rimraf from "rimraf";
import gitP, { SimpleGit } from "simple-git/promise";

const jq = require("node-jq");

class Gtmt extends Command {
  static description = "Get my portfolio";

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: "v" }),
    help: flags.help({ char: "h" }),
    // flag with no value (-f, --force)
    force: flags.boolean({ char: "f" }),
  };

  headless = true;

  slowMo = 100;

  devtools = true;

  timeout = 0;

  moneyforwardEmail = process.env.MONEYFORWARD_EMAIL;

  moneyforwardPass = process.env.MONEYFORWARD_PASS;

  slackToken = process.env.GTMT_SLACK_TOKEN;

  portfolioRepo = process.env.PORTFOLIO_GITHUB_URL;

  portfolioUser = process.env.PORTFOLIO_GITHUB_USER;

  portfolioPass = process.env.PORTFOLIO_GITHUB_PASS;

  // bitlyToken = process.env.BITLY_TOKEN;

  portfolioPath = "/tmp/portfolio/portfolio.json";

  groupByDayPath = "/tmp/group.json";

  filterPortfolio = [
    "time",
    "住信SBIネット銀行",
    "三井住友銀行",
    "三菱UFJ銀行",
    "ゆうちょ銀行",
    "SBI証券",
    "coincheck",
    "bitbank",
    "bitFlyer",
    "BTCBOX",
    "Liquid by Quoine",
    "2681-ゲオHD",
    "8267-イオン",
    "WealthNavi（ウェルスナビ）",
    "One-MHAM新興成長株オープン",
    "三井住友TAM-世界経済インデックスファンド",
    "Amazon.co.jp-Amazonポイント",
  ];

  browser!: puppeteer.Browser;

  page!: puppeteer.Page;

  portfolio: object = {
    time: moment().tz("Asia/Tokyo").format("YYYY/MM/DD HH:mm:ss.SSS"),
  };

  toNormalNumber(yen = ""): string {
    if (/[^0-9,]*([0-9,]+)円/.test(yen)) {
      return yen
        .replace(/[^0-9,]*([0-9,]+)円/, "$1")
        .replace(/,/g, "")
        .replace(/\r?\n/g, "");
    }
    return yen;
  }

  getTableData(table: Element): object {
    const thead = [
      ...((table as HTMLTableElement).tHead?.rows[0] as HTMLTableRowElement)
        .cells,
    ].map((x) => x.innerText.trim());

    const rows = [...(table as HTMLTableElement).tBodies[0].rows].map((row) =>
      [...(row as HTMLTableRowElement).cells].map((x) => x.innerText.trim())
    );

    return rows.map((row) => _.zipObject(thead, row));
  }

  async filterBalance(str: string): Promise<number[]> {
    return JSON.parse(
      await jq.run(str, this.groupByDayPath, { input: "file" }),
    ).map(Number);
  }

  async filterDetDepo(fil1: string, fil2: string): Promise<number[]> {
    return this.filterBalance(
      `[.[].detDepo[] | select(."種類・名称" == "${fil1}" and ."保有金融機関" == "${fil2}") | .balance]`,
    );
  }

  async filterDetEq(fil1: string): Promise<number[]> {
    return this.filterBalance(
      `[.[].detEq[] | select(."銘柄コード" == "${fil1}") | .balance]`,
    );
  }

  async filterDetMf(fil1: string): Promise<number[]> {
    return this.filterBalance(
      `[.[].detMf[] | select(."銘柄名" == "${fil1}") | .balance]`,
    );
  }
  // async filterDetMfExt(fil1: string): Promise<number[][]> {
  //   return this.filterBalance(
  //     `[.[].detMf[] | select(."保有金融機関" == "${fil1}") | .balance]`
  //   );
  // }

  async postToSlack(
    balance: number[],
    ac: string,
    colorStr: string,
    xs: string[],
  ): Promise<WebAPICallResult> {
    const label = balance.map((x, idx) => idx === balance.length - 1 ? x : "");
    const c = new Color(`#${colorStr}`);
    const b = c.lighten(0.3).hex().replace("#", "");
    const web = new WebClient(this.slackToken);
    const imgUrl = encodeURI(
      `https://image-charts.com/chart?cht=lc&chxt=x,y&chxl=0:|${
        xs.join(
          "|",
        )
      }&chd=a:${
        balance.join(
          ",",
        )
      }&chs=999x999&chco=${colorStr}&chdl=${ac}&chl=${
        label.join(
          "|",
        )
      }&chm=s,${colorStr},0,-1,13.0|B,${b},0,0,0&chls=5`,
    );
    // if (!this.bitlyToken) {
    //   this.log("Set BITLY_TOKEN env !");
    //   throw new Error("Set BITLY_TOKEN env !");
    // }
    console.log({ imgUrl });
    // const bitly = new BitlyClient(this.bitlyToken);
    // const shorten = await bitly.shorten(imgUrl);
    // console.log({ shortenUrl: shorten.link });

    return web.chat.postMessage({
      channel: "#portfolio",
      text: `[${ac}] の資産です！`,
      attachments: [
        {
          fields: [
            {
              title: "portfolio",
              value: "",
            },
          ],
          // eslint-disable-next-line @typescript-eslint/camelcase
          // image_url: shorten.link,
          image_url: imgUrl,
          // eslint-disable-next-line @typescript-eslint/camelcase
          // thumb_url: shorten.link,
          thumb_url: imgUrl,
        },
      ],
    });
  }

  groupByDayPortfolio(): void {
    const portfolio = JSON.parse(fs.readFileSync(this.portfolioPath, "utf-8"));
    const thisMonthStr = moment().format("YYYY/MM");

    const dates = _.chain(portfolio)
      .groupBy((x) => x.time.substr(0, 10))
      .mapValues((x) => x[x.length - 1])
      .values()
      .value();

    const months = _.chain(dates)
      .filter((x) => x.time.substr(0, 7) !== thisMonthStr)
      .groupBy((x) => x.time.substr(0, 7))
      .mapValues((x) => x[x.length - 1])
      .values()
      .map((x) => {
        x.label = x.time.substr(5, 2) + "月";
        return x;
      })
      .value();

    const thisMonth = _.chain(dates)
      .filter((x) => x.time.substr(0, 7) === thisMonthStr)
      .map((x) => {
        x.label = x.time.substr(8, 2) + "日";
        return x;
      })
      .value();

    const out = _.concat(months, thisMonth);

    fs.writeFileSync(this.groupByDayPath, JSON.stringify(out));
  }

  adjustLength(exchange: number[], dates: string[]): number[] {
    const diff = dates.length - exchange.length;
    return _.concat(_.times(diff, _.constant(0)), exchange);
  }

  async init(): Promise<void> {
    try {
      this.log("init start");
      this.browser = await puppeteer.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        devtools: this.devtools,
        timeout: this.timeout,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36",
        ],
      });
      this.page = await this.browser.newPage();
      this.page.setDefaultTimeout(this.timeout);
      // this.page.on("console", (msg) => console.log("PAGE LOG: ", msg.text()));
    } finally {
      this.log("init end");
    }
  }

  async signin(): Promise<void> {
    try {
      this.log("signin start");
      if (!this.moneyforwardEmail) {
        this.log("Set MONEYFORWARD_EMAIL env !");
        throw new Error("Set MONEYFORWARD_EMAIL env !");
      }
      if (!this.moneyforwardPass) {
        this.log("Set MONEYFORWARD_EMAIL env !");
        throw new Error("Set MONEYFORWARD_EMAIL env !");
      }
      if (!this.slackToken) {
        this.log("Set GTMT_SLACK_TOKEN env !");
        throw new Error("Set GTMT_SLACK_TOKEN env !");
      }

      await this.page.goto("https://moneyforward.com", {
        waitUntil: ["load", "networkidle2"],
      });

      // await this.page.screenshot({
      //   path: "screenshot/moneyforward_top.png",
      //   fullPage: true,
      // });

      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('a[href="/sign_in"]'),
      ]);
      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('a[href^="/sign_in/email"]'),
      ]);

      await this.page.type(
        'input[name="mfid_user[email]"]',
        this.moneyforwardEmail,
      );
      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('input[type="submit"]'),
      ]);

      await this.page.type(
        'input[name="mfid_user[password]"]',
        this.moneyforwardPass,
      );

      // await this.page.screenshot({
      //   path: "screenshot/moneyforward_sign_in_1.png",
      //   fullPage: true,
      // });

      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('input[type="submit"]'),
      ]);

      // await this.page.screenshot({
      //   path: "screenshot/moneyforward_sign_in_2.png",
      //   fullPage: true,
      // });
    } finally {
      this.log("signin end");
    }
  }

  async update(): Promise<void> {
    try {
      this.log("update start");

      await this.page.$$eval(
        'section#registered-accounts ul.accounts-list a[data-remote="true"][rel="nofollow"][data-method="post"]',
        (els) => {
          console.log(els);
          els.map((el) => (el as HTMLElement).click());
        },
      );
    } finally {
      this.log("update end");
    }
  }

  async run(): Promise<void> {
    try {
      const { flags } = this.parse(Gtmt);

      this.log(`hello from ./src/index.ts`);
      if (flags.force) {
        this.log(`you input --force`);
      }

      await this.signin();

      await this.update();

      await this.page.goto("https://moneyforward.com/bs/portfolio", {
        waitUntil: ["load", "networkidle2"],
      });

      // await this.page.screenshot({
      //   path: "screenshot/moneyforward_portfolio_1.png",
      //   fullPage: true,
      // });

      // Summary
      const summaryEl = await this.page.$("div.heading-radius-box");
      const summaryStr = await summaryEl?.evaluate((x) => x.innerHTML);
      const summary = [
        {
          種類: "資産総額",
          残高: (summaryStr as string)
            .replace(/[^0-9,]*([0-9,]+円)\n/, "$1")
            .replace(/\r?\n/g, ""),
          balance: this.toNormalNumber(summaryStr),
        },
      ];
      console.log({ summary });

      // Assets
      const assetsOut = await this.page.$eval(
        "section.bs-total-assets table tbody",
        (tbody) =>
          [...(tbody as HTMLTableElement).rows].map((row) => {
            const kind = row.cells[0].innerText.trim();
            const balance = row.cells[1].innerText.trim();
            return { 種類: kind, 残高: balance };
          }),
      );
      const assets = _.map(assetsOut, (asset) => {
        return { ...asset, balance: this.toNormalNumber(asset.残高) };
      });
      console.log({ assets });

      // portfolio_det_depo
      const detDepoOut = await this.page.$eval(
        "section#portfolio_det_depo table",
        this.getTableData,
      );
      const detDepo = _.map(detDepoOut, (depo: object) => {
        if (Object.hasOwnProperty.call(depo, "残高")) {
          return {
            ...depo,
            balance: this.toNormalNumber((depo as { 残高: string }).残高),
          };
        }
        return { ...depo, balance: 0 };
      });
      console.log({ detDepo });

      // portfolio_det_eq
      const detEqOut = await this.page.$eval(
        "section#portfolio_det_eq table",
        this.getTableData,
      );
      const detEq = _.map(detEqOut, (eq: object) => {
        if (Object.hasOwnProperty.call(eq, "評価額")) {
          return {
            ...eq,
            balance: this.toNormalNumber((eq as { 評価額: string }).評価額),
          };
        }
        return { ...eq, balance: 0 };
      });
      console.log({ detEq });

      // portfolio_det_mf
      const detMfOut = await this.page.$eval(
        "section#portfolio_det_mf table",
        this.getTableData,
      );
      const detMf = _.map(detMfOut, (mf: object) => {
        if (Object.hasOwnProperty.call(mf, "評価額")) {
          return {
            ...mf,
            balance: this.toNormalNumber((mf as { 評価額: string }).評価額),
          };
        }
        return { ...mf, balance: 0 };
      });
      console.log({ detMf });

      // portfolio_det_fx
      // const detFxOut = await this.page.$eval(
      //   "section#portfolio_det_fx table",
      //   this.getTableData
      // );
      // const detFx = _.map(detFxOut, (fx: object) => {
      //   if (Object.hasOwnProperty.call(fx, "残高")) {
      //     return {
      //       ...fx,
      //       balance: this.toNormalNumber((fx as { 残高: string }).残高),
      //     };
      //   }
      //   return { ...fx, balance: 0 };
      // });
      // console.log({ detFx });

      // portfolio_det_po
      const detPoOut = await this.page.$eval(
        "section#portfolio_det_po table",
        this.getTableData,
      );
      const detPo = _.map(detPoOut, (po: object) => {
        if (Object.hasOwnProperty.call(po, "現在の価値")) {
          return {
            ...po,
            balance: this.toNormalNumber(
              (po as { 現在の価値: string }).現在の価値,
            ),
          };
        }
        return { ...po, balance: 0 };
      });
      console.log({ detPo });

      this.portfolio = {
        ...this.portfolio,
        summary,
        assets,
        detDepo,
        detEq,
        detMf,
        // detFx,
        detPo,
      };

      console.log({ portfolio: this.portfolio });

      if (!this.portfolioRepo) {
        this.log("Set PORTFOLIO_GITHUB_URL env !");
        throw new Error("Set PORTFOLIO_GITHUB_URL env !");
      }
      if (!this.portfolioUser) {
        this.log("Set PORTFOLIO_GITHUB_USER env !");
        throw new Error("Set PORTFOLIO_GITHUB_USER env !");
      }
      if (!this.portfolioPass) {
        this.log("Set PORTFOLIO_GITHUB_PASS env !");
        throw new Error("Set PORTFOLIO_GITHUB_PASS env !");
      }
      // if (!this.bitlyToken) {
      // this.log("Set BITLY_TOKEN env !");
      // throw new Error("Set BITLY_TOKEN env !");
      // }

      rimraf.sync("/tmp/portfolio");
      const remote =
        `https://${this.portfolioUser}:${this.portfolioPass}@${this.portfolioRepo}`;

      const gitClone: SimpleGit = gitP("/tmp");
      await gitClone.clone(remote);

      const git: SimpleGit = gitP("/tmp/portfolio");

      await git.addConfig("user.email", `${this.portfolioUser}@gmail.com`);
      await git.addConfig("user.name", this.portfolioUser);

      if (fs.existsSync(this.portfolioPath)) {
        const portfolio = JSON.parse(
          fs.readFileSync(this.portfolioPath, "utf-8"),
        );
        const newPortfolio = _.concat(portfolio, this.portfolio);
        fs.writeFileSync(this.portfolioPath, JSON.stringify(newPortfolio));
      } else {
        fs.writeFileSync(this.portfolioPath, JSON.stringify([this.portfolio]));
      }

      await git.add(".");
      await git.commit(
        moment().tz("Asia/Tokyo").format("YYYY/MM/DD HH:mm:ss.SSS"),
      );
      await git.push();

      // const history = JSON.parse(fs.readFileSync(this.portfolioPath, "utf-8"));

      this.groupByDayPortfolio();

      // const times = JSON.parse(
      //   await jq.run("[.[].time]", this.groupByDayPath, { input: "file" })
      // );
      // const dates = times.map((x: string) => x.substr(8, 2));
      const dates = JSON.parse(
        await jq.run("[.[].label]", this.groupByDayPath, { input: "file" }),
      );

      const sbi1 = await this.filterDetDepo(
        "代表口座 - 円普通",
        "住信SBIネット銀行",
      );
      const sbi2 = await this.filterDetDepo(
        "SBIハイブリッド預金",
        "住信SBIネット銀行",
      );
      let sbi = _.zipWith(sbi1, sbi2, (a, b) => a + b);
      console.log({ sbi });
      sbi = this.adjustLength(sbi, dates);
      await this.postToSlack(sbi, "住信SBIネット銀行", "1E90FF", dates);

      let smbc = await this.filterDetDepo("残高別普通預金残高", "三井住友銀行");
      console.log({ smbc });
      smbc = this.adjustLength(smbc, dates);
      await this.postToSlack(smbc, "三井住友銀行", "32CD32", dates);

      let ufj = await this.filterDetDepo("普通", "三菱UFJ銀行");
      console.log({ ufj });
      ufj = this.adjustLength(ufj, dates);
      await this.postToSlack(ufj, "三菱UFJ銀行", "DC143C", dates);

      let yucho = await this.filterDetDepo("二二八店 普通", "ゆうちょ銀行");
      console.log({ yucho });
      yucho = this.adjustLength(yucho, dates);
      await this.postToSlack(yucho, "ゆうちょ銀行", "228B22", dates);

      const coincheck1 = await this.filterDetDepo(
        "ビットコイン残高",
        "coincheck",
      );
      const coincheck2 = await this.filterDetDepo("Ripple残高", "coincheck");
      const coincheck3 = await this.filterDetDepo("Litecoin残高", "coincheck");
      const coincheck4 = await this.filterDetDepo(
        "ビットコイン キャッシュ残高",
        "coincheck",
      );
      const coincheck5 = await this.filterDetDepo("円残高", "coincheck");
      let coincheck = _.zipWith(
        coincheck1,
        coincheck2,
        coincheck3,
        coincheck4,
        coincheck5,
        (a, b, c, d, e) => a + b + c + d + e,
      );
      console.log({ coincheck });
      coincheck = this.adjustLength(coincheck, dates);
      await this.postToSlack(coincheck, "coincheck", "00FFFF", dates);

      const bitbank1 = await this.filterDetDepo("ビットコイン残高", "bitbank");
      const bitbank2 = await this.filterDetDepo("円残高", "bitbank");
      let bitbank = _.zipWith(bitbank1, bitbank2, (a, b) => a + b);
      console.log({ bitbank });
      bitbank = this.adjustLength(bitbank, dates);
      // await this.postToSlack(bitbank, "bitbank", "A9A9A9", dates);

      const btcbox1 = await this.filterDetDepo("BTC残高", "BTCBOX");
      const btcbox2 = await this.filterDetDepo("JPY残高", "BTCBOX");
      let btcbox = _.zipWith(btcbox1, btcbox2, (a, b) => a + b);
      console.log({ btcbox });
      btcbox = this.adjustLength(btcbox, dates);
      // await this.postToSlack(btcbox, "BTCBOX", "FFA500", dates);

      const bitFlyer1 = await this.filterDetDepo(
        "ビットコイン残高",
        "bitFlyer",
      );
      const bitFlyer2 = await this.filterDetDepo("Mona残高", "bitFlyer");
      const bitFlyer3 = await this.filterDetDepo("円残高", "bitFlyer");
      let bitFlyer = _.zipWith(
        bitFlyer1,
        bitFlyer2,
        bitFlyer3,
        (a, b, c) => a + b + c,
      );
      console.log({ bitFlyer });
      bitFlyer = this.adjustLength(bitFlyer, dates);
      await this.postToSlack(bitFlyer, "bitFlyer", "8B008B", dates);

      const liquid1 = await this.filterDetDepo("円残高", "Liquid by Quoine");
      const liquid2 = await this.filterDetDepo(
        "ビットコイン残高",
        "Liquid by Quoine",
      );
      let liquid = _.zipWith(liquid1, liquid2, (a, b) => a + b);
      console.log({ liquid });
      liquid = this.adjustLength(liquid, dates);
      // await this.postToSlack(liquid, "Liquid by Quoine", "00008B", dates);

      // const geo = await this.filterDetEq("2681");
      // console.log({ geo });
      // await this.postToSlack(geo, "ゲオHD", "FFFF00", dates);

      let aeon = await this.filterDetEq("8267");
      console.log({ aeon });
      aeon = this.adjustLength(aeon, dates);
      await this.postToSlack(aeon, "イオン", "FF00FF", dates);

      let oneOpen = await this.filterDetMf("One-MHAM新興成長株オープン");
      console.log({ oneOpen });
      oneOpen = this.adjustLength(oneOpen, dates);
      await this.postToSlack(oneOpen, "One-MHAM", "2F4F4F", dates);

      let worldIndex = await this.filterDetMf(
        "三井住友TAM-世界経済インデックスファンド",
      );
      console.log({ worldIndex });
      worldIndex = this.adjustLength(worldIndex, dates);
      await this.postToSlack(
        worldIndex,
        "世界経済インデックス",
        "800000",
        dates,
      );

      let wealthNavi1 = await this.filterDetDepo(
        "現金",
        "WealthNavi（ウェルスナビ）",
      );
      wealthNavi1 = this.adjustLength(wealthNavi1, dates);
      let wealthNavi2 = await this.filterDetMf("米国株(VTI)");
      wealthNavi2 = this.adjustLength(wealthNavi2, dates);
      let wealthNavi3 = await this.filterDetMf("日欧株(VEA)");
      wealthNavi3 = this.adjustLength(wealthNavi3, dates);
      let wealthNavi4 = await this.filterDetMf("新興国株(VWO)");
      wealthNavi4 = this.adjustLength(wealthNavi4, dates);
      let wealthNavi5 = await this.filterDetMf("米国債券(AGG)");
      wealthNavi5 = this.adjustLength(wealthNavi5, dates);
      let wealthNavi6 = await this.filterDetMf("金(GLD)");
      wealthNavi6 = this.adjustLength(wealthNavi6, dates);
      let wealthNavi7 = await this.filterDetMf("不動産(IYR)");
      wealthNavi7 = this.adjustLength(wealthNavi7, dates);

      let wealthNavi = _.zipWith(
        wealthNavi1,
        wealthNavi2,
        wealthNavi3,
        wealthNavi4,
        wealthNavi5,
        wealthNavi6,
        wealthNavi7,
        (a, b, c, d, e, f, g) => a + b + c + d + e + f + g,
      );
      await this.postToSlack(wealthNavi, "WealthNavi", "1688C5", dates);

      console.log({
        sbi: sbi.length,
        smbc: smbc.length,
        ufj: ufj.length,
        yucho: yucho.length,
        coincheck: coincheck.length,
        // bitbank: bitbank.length,
        // btcbox: btcbox.length,
        bitFlyer: bitFlyer.length,
        // liquid: liquid.length,
        aeon: aeon.length,
        oneOpen: oneOpen.length,
        worldIndex: worldIndex.length,
        wealthNavi: wealthNavi.length,
      });

      const total = _.zipWith(
        sbi,
        smbc,
        ufj,
        yucho,
        aeon,
        oneOpen,
        worldIndex,
        coincheck,
        bitFlyer,
        wealthNavi,
        (x1, x2, x3, x4, x5, x6, x7, x8, x9, x10) =>
          x1 + x2 + x3 + x4 + x5 + x6 + x7 + x8 + x9 + x10,
      );
      console.log({ total });

      const label = total.map((x, idx) => (idx === total.length - 1 ? x : ""));

      const imgUrl = encodeURI(
        `https://image-charts.com/chart?cht=bvs&chxt=x,y&chxl=0:|${
          dates.join(
            "|",
          )
        }&chd=a:${
          [
            sbi,
            smbc,
            ufj,
            yucho,
            aeon,
            oneOpen,
            worldIndex,
            coincheck,
            bitFlyer,
            wealthNavi,
          ]
            .map((x) => x.join(","))
            .join("|")
        }&chs=999x999&chco=${
          [
            "1E90FF",
            "32CD32",
            "DC143C",
            "228B22",
            "FF00FF",
            "2F4F4F",
            "800000",
            "00FFFF",
            "8B008B",
            "1688C5",
          ].join(",")
        }&chdl=${
          [
            "住信SBIネット銀行",
            "三井住友銀行",
            "三菱UFJ銀行",
            "ゆうちょ銀行",
            "イオン",
            "One-MHAM",
            "世界経済インデックス",
            "coincheck",
            "bitFlyer",
            "WealthNavi",
          ].join("|")
        }&chl=${label.join("|")}`,
      );

      console.log({ imgUrl });

      // const bitly = new BitlyClient(this.bitlyToken);
      // const shorten = await bitly.shorten(imgUrl);
      // console.log({ shortenUrl: shorten.link });

      const web = new WebClient(this.slackToken);
      const res = await web.chat.postMessage({
        channel: "#portfolio",
        text: "現在の資産です！",
        attachments: [
          {
            // title: "portfolio",
            // text: "portfolio",
            fields: [
              {
                title: "portfolio",
                value: "",
              },
            ],
            // eslint-disable-next-line @typescript-eslint/camelcase
            // image_url: shorten.link,
            image_url: imgUrl,
            // eslint-disable-next-line @typescript-eslint/camelcase
            // thumb_url: shorten.link,
            thumb_url: imgUrl,
          },
        ],
      });
      console.log({ res });

      await this.browser.close();
    } catch (error) {
      this.log(error);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

export = Gtmt;
