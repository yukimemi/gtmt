import { Command, flags } from "@oclif/command";
import * as fs from "fs";
import * as _ from "lodash";
import * as moment from "moment";
import * as puppeteer from "puppeteer";

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
