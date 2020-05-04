import { Command, flags } from "@oclif/command";
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

  async run() {
    const { flags } = this.parse(Gtmt);

    this.log(`hello from ./src/index.ts`);
    if (flags.force) {
      this.log(`you input --force`);
    }

    const browser = await puppeteer.launch({
      headless: this.headless,
      slowMo: this.slowMo,
    });
    const page = await browser.newPage();
    await page.goto("https://id.moneyforward.com/sign_in/email");
    await page.screenshot({
      path: "screenshot/moneyforward_sign_in.png",
      fullPage: true,
    });

    await browser.close();
  }
}

export = Gtmt;
