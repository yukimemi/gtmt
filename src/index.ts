import { Command, flags } from "@oclif/command";
import * as fs from "fs";
import * as _ from "lodash";
import * as moment from "moment";
import * as puppeteer from "puppeteer";

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

  slowMo = 0;

  devtools = true;

  timeout = 0;

  moneyforwardEmail = process.env.MONEYFORWARD_EMAIL;

  moneyforwardPass = process.env.MONEYFORWARD_PASS;

  cookiesPath = "cookies.json";

  portfolioPath = "portfolio.json";

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
    "One-MHAM新興成長株オープン",
    "三井住友TAM-世界経済インデックスファンド",
    "Amazon.co.jp-Amazonポイント",
  ];

  browser!: puppeteer.Browser;

  page!: puppeteer.Page;

  portfolio: object = { time: moment().format("YYYY/MM/DD HH:mm:ss.SSS") };

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

  async filterDetDepo(fil1: string, fil2: string): Promise<number[]> {
    return JSON.parse(
      await jq.run(
        `[.[].detDepo[] | select(."種類・名称" == "${fil1}" and ."保有金融機関" == "${fil2}") | .balance]`,
        this.portfolioPath,
        { input: "file" }
      )
    ).map(Number);
  }

  async init(): Promise<void> {
    try {
      this.log("init start");
      this.browser = await puppeteer.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        devtools: this.devtools,
        timeout: this.timeout,
      });
      this.page = await this.browser.newPage();
      this.page.setDefaultTimeout(this.timeout);
      this.page.on("console", (msg) => console.log("PAGE LOG: ", msg.text()));
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

      await this.page.goto("https://moneyforward.com", {
        waitUntil: ["load", "networkidle2"],
      });

      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('a[href="/users/sign_in"]'),
      ]);
      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('a[href^="/sign_in/email"]'),
      ]);

      await this.page.type(
        'input[name="mfid_user[email]"]',
        this.moneyforwardEmail
      );
      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('input[type="submit"]'),
      ]);

      await this.page.type(
        'input[name="mfid_user[password]"]',
        this.moneyforwardPass
      );

      await this.page.screenshot({
        path: "screenshot/moneyforward_sign_in_1.png",
        fullPage: true,
      });

      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('input[type="submit"]'),
      ]);

      await this.page.screenshot({
        path: "screenshot/moneyforward_sign_in_2.png",
        fullPage: true,
      });
    } finally {
      this.log("signin end");
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

      await this.page.goto("https://moneyforward.com/bs/portfolio", {
        waitUntil: ["load", "networkidle2"],
      });

      await this.page.screenshot({
        path: "screenshot/moneyforward_portfolio_1.png",
        fullPage: true,
      });

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
          })
      );
      const assets = _.map(assetsOut, (asset) => {
        return { ...asset, balance: this.toNormalNumber(asset.残高) };
      });
      console.log({ assets });

      // portfolio_det_depo
      const detDepoOut = await this.page.$eval(
        "section#portfolio_det_depo table",
        this.getTableData
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
        this.getTableData
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
        this.getTableData
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
      const detFxOut = await this.page.$eval(
        "section#portfolio_det_fx table",
        this.getTableData
      );
      const detFx = _.map(detFxOut, (fx: object) => {
        if (Object.hasOwnProperty.call(fx, "残高")) {
          return {
            ...fx,
            balance: this.toNormalNumber((fx as { 残高: string }).残高),
          };
        }
        return { ...fx, balance: 0 };
      });
      console.log({ detFx });

      // portfolio_det_po
      const detPoOut = await this.page.$eval(
        "section#portfolio_det_po table",
        this.getTableData
      );
      const detPo = _.map(detPoOut, (po: object) => {
        if (Object.hasOwnProperty.call(po, "現在の価値")) {
          return {
            ...po,
            balance: this.toNormalNumber(
              (po as { 現在の価値: string }).現在の価値
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
        detFx,
        detPo,
      };

      console.log({ portfolio: this.portfolio });

      if (fs.existsSync(this.portfolioPath)) {
        const portfolio = JSON.parse(
          fs.readFileSync(this.portfolioPath, "utf-8")
        );
        const newPortfolio = _.concat(portfolio, this.portfolio);
        fs.writeFileSync(this.portfolioPath, JSON.stringify(newPortfolio));
      } else {
        fs.writeFileSync(this.portfolioPath, JSON.stringify([this.portfolio]));
      }

      // const history = JSON.parse(fs.readFileSync(this.portfolioPath, "utf-8"));

      const sbi1 = await this.filterDetDepo(
        "代表口座 - 円普通",
        "住信SBIネット銀行"
      );
      const sbi2 = await this.filterDetDepo(
        "SBIハイブリッド預金",
        "住信SBIネット銀行"
      );
      const sbi = _.zipWith(sbi1, sbi2, (a, b) => a + b);
      console.log({ sbi });

      const smbc = await this.filterDetDepo(
        "残高別普通預金残高",
        "三井住友銀行"
      );
      console.log({ smbc });

      const ufj = await this.filterDetDepo("普通預金", "三菱UFJ銀行");
      console.log({ ufj });

      const yucho = await this.filterDetDepo("二二八店 普通", "ゆうちょ銀行");
      console.log({ yucho });

      const coincheck1 = await this.filterDetDepo(
        "ビットコイン残高",
        "coincheck"
      );
      const coincheck2 = await this.filterDetDepo("Ripple残高", "coincheck");
      const coincheck3 = await this.filterDetDepo("Litecoin残高", "coincheck");
      const coincheck4 = await this.filterDetDepo(
        "ビットコイン キャッシュ残高",
        "coincheck"
      );
      const coincheck5 = await this.filterDetDepo("円残高", "coincheck");
      const coincheck = _.zipWith(
        coincheck1,
        coincheck2,
        coincheck3,
        coincheck4,
        coincheck5,
        (a, b, c, d, e) => a + b + c + d + e
      );
      console.log({ coincheck });

      const bitbank1 = await this.filterDetDepo("ビットコイン残高", "bitbank");
      const bitbank2 = await this.filterDetDepo("円残高", "bitbank");
      const bitbank = _.zipWith(bitbank1, bitbank2, (a, b) => a + b);
      console.log({ bitbank });

      const btcbox1 = await this.filterDetDepo("BTC残高", "BTCBOX");
      const btcbox2 = await this.filterDetDepo("JPY残高", "BTCBOX");
      const btcbox = _.zipWith(btcbox1, btcbox2, (a, b) => a + b);
      console.log({ btcbox });

      const bitFlyer1 = await this.filterDetDepo(
        "ビットコイン残高",
        "bitFlyer"
      );
      const bitFlyer2 = await this.filterDetDepo("Mona残高", "bitFlyer");
      const bitFlyer3 = await this.filterDetDepo("円残高", "bitFlyer");
      const bitFlyer = _.zipWith(
        bitFlyer1,
        bitFlyer2,
        bitFlyer3,
        (a, b, c) => a + b + c
      );
      console.log(bitFlyer);

      const liquid = await this.filterDetDepo("円残高", "Liquid by Quoine");
      console.log({ liquid });

      const total = _.zipWith(
        sbi,
        smbc,
        ufj,
        yucho,
        coincheck,
        bitbank,
        btcbox,
        bitFlyer,
        liquid,
        (x1, x2, x3, x4, x5, x6, x7, x8, x9) =>
          x1 + x2 + x3 + x4 + x5 + x6 + x7 + x8 + x9
      );
      console.log({ total });

      const times = JSON.parse(
        await jq.run("[.[].time]", this.portfolioPath, { input: "file" })
      );

      // const imgUrl = encodeURI(
      //   `https://image-charts.com/chart?cht=lc&chxt=x,y&chd=a:${[
      //     sbi1,
      //     sbi2,
      //     smbc,
      //     ufj,
      //     yucho,
      //     coincheck1,
      //     coincheck2,
      //     coincheck3,
      //     coincheck4,
      //     coincheck5,
      //     bitbank1,
      //     bitbank2,
      //     btcbox1,
      //     btcbox2,
      //     bitFlyer1,
      //     bitFlyer2,
      //     bitFlyer3,
      //     liquid,
      //   ]
      //     .map((x) => x.join(","))
      //     .join("|")}&chs=999x999&chco=${[
      //     "1E90FF",
      //     "4169E1",
      //     "32CD32",
      //     "DC143C",
      //     "228B22",
      //     "00FFFF",
      //     "00BFFF",
      //     "48D1CC",
      //     "6495ED",
      //     "40E0D0",
      //     "A9A9A9",
      //     "C0C0C0",
      //     "FFA500",
      //     "FFD700",
      //     "8B008B",
      //     "8B0000",
      //     "A52A2A",
      //     "00008B",
      //   ].join(",")}&chdl=${[
      //     "代表口座 - 円普通 (住信SBIネット銀行)",
      //     "SBIハイブリッド預金 (住信SBIネット銀行)",
      //     "残高別普通預金残高 (三井住友銀行)",
      //     "普通預金 (三菱UFJ銀行)",
      //     "二二八店 普通 (ゆうちょ銀行)",
      //     "ビットコイン残高 (coincheck)",
      //     "Ripple残高 (coincheck)",
      //     "Litecoin残高 (coincheck)",
      //     "ビットコイン キャッシュ残高 (coincheck)",
      //     "円残高 (coincheck)",
      //     "ビットコイン残高 (bitbank)",
      //     "円残高 (bitbank)",
      //     "BTC残高 (BTCBOX)",
      //     "JPY残高 (BTCBOX)",
      //     "ビットコイン残高 (bitFlyer)",
      //     "Mona残高 (bitFlyer)",
      //     "円残高 (bitFlyer)",
      //     "円残高 (Liquid by Quoine)",
      //   ].join("|")}`
      // );

      const imgUrl = encodeURI(
        `https://image-charts.com/chart?cht=bvs&chxt=x,y&chd=a:${[
          sbi,
          smbc,
          ufj,
          yucho,
          coincheck,
          bitbank,
          btcbox,
          bitFlyer,
          liquid,
        ]
          .map((x) => x.join(","))
          .join("|")}&chs=999x999&chco=${[
          "1E90FF",
          "32CD32",
          "DC143C",
          "228B22",
          "00FFFF",
          "A9A9A9",
          "FFA500",
          "8B008B",
          "00008B",
        ].join(",")}&chdl=${[
          "住信SBIネット銀行",
          "三井住友銀行",
          "三菱UFJ銀行",
          "ゆうちょ銀行",
          "coincheck",
          "bitbank",
          "BTCBOX",
          "bitFlyer",
          "Liquid by Quoine",
        ].join("|")}&chl=${total.join("|")}`
      );

      console.log(imgUrl);

      await this.page.goto(imgUrl, {
        waitUntil: ["load", "networkidle2"],
      });

      await this.page.screenshot({
        path: "screenshot/portfolio.png",
        fullPage: true,
      });

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
