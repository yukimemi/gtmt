import { Command, flags } from "@oclif/command";
import * as fs from "fs";
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

  headless = false;

  slowMo = 50;

  timeout = 0;

  moneyforwardEmail = process.env.MONEYFORWARD_EMAIL;

  moneyforwardPass = process.env.MONEYFORWARD_PASS;

  cookiesPath = "cookies.json";

  browser!: puppeteer.Browser;

  page!: puppeteer.Page;

  async init(): Promise<void> {
    try {
      this.log("init start");
      this.browser = await puppeteer.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        timeout: this.timeout,
      });
      this.page = await this.browser.newPage();
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
        this.page.waitForNavigation({ timeout: this.timeout }),
        this.page.click('a[href="/users/sign_in"]'),
      ]);
      await Promise.all([
        this.page.waitForNavigation({ timeout: this.timeout }),
        this.page.click('a[href^="/sign_in/email"]'),
      ]);

      await this.page.type(
        'input[name="mfid_user[email]"]',
        this.moneyforwardEmail
      );
      await Promise.all([
        this.page.waitForNavigation({ timeout: this.timeout }),
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
        this.page.waitForNavigation({ timeout: this.timeout }),
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

      const cookies = await this.page.cookies();
      fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies));

      // const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, "utf-8"));
      // for (const cookie of cookies) {
      //   await page.setCookie(cookie);
      // }

      // await this.page.goto("https://moneyforward.com/bs/portfolio", {
      //   waitUntil: ["load", "networkidle2"],
      // });

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
