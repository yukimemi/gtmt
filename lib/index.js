"use strict";
const command_1 = require("@oclif/command");
const web_api_1 = require("@slack/web-api");
const fs = require("fs");
const _ = require("lodash");
const moment = require("moment");
const puppeteer = require("puppeteer");
const jq = require("node-jq");
class Gtmt extends command_1.Command {
    constructor() {
        super(...arguments);
        this.headless = true;
        this.slowMo = 0;
        this.devtools = true;
        this.timeout = 0;
        this.moneyforwardEmail = process.env.MONEYFORWARD_EMAIL;
        this.moneyforwardPass = process.env.MONEYFORWARD_PASS;
        this.slackToken = process.env.GTMT_SLACK_TOKEN;
        this.cookiesPath = "cookies.json";
        this.portfolioPath = "/tmp/portfolio.json";
        this.filterPortfolio = [
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
        this.portfolio = { time: moment().format("YYYY/MM/DD HH:mm:ss.SSS") };
    }
    toNormalNumber(yen = "") {
        if (/[^0-9,]*([0-9,]+)円/.test(yen)) {
            return yen
                .replace(/[^0-9,]*([0-9,]+)円/, "$1")
                .replace(/,/g, "")
                .replace(/\r?\n/g, "");
        }
        return yen;
    }
    getTableData(table) {
        var _a;
        const thead = [
            ...((_a = table.tHead) === null || _a === void 0 ? void 0 : _a.rows[0])
                .cells,
        ].map((x) => x.innerText.trim());
        const rows = [...table.tBodies[0].rows].map((row) => [...row.cells].map((x) => x.innerText.trim()));
        return rows.map((row) => _.zipObject(thead, row));
    }
    async filterBalance(str) {
        return JSON.parse(await jq.run(str, this.portfolioPath, { input: "file" })).map(Number);
    }
    async filterDetDepo(fil1, fil2) {
        return this.filterBalance(`[.[].detDepo[] | select(."種類・名称" == "${fil1}" and ."保有金融機関" == "${fil2}") | .balance]`);
    }
    async filterDetEq(fil1) {
        return this.filterBalance(`[.[].detEq[] | select(."銘柄コード" == "${fil1}") | .balance]`);
    }
    async filterDetMf(fil1) {
        return this.filterBalance(`[.[].detMf[] | select(."銘柄名" == "${fil1}") | .balance]`);
    }
    async init() {
        try {
            this.log("init start");
            this.browser = await puppeteer.launch({
                headless: this.headless,
                slowMo: this.slowMo,
                devtools: this.devtools,
                timeout: this.timeout,
                args: ["--no-sandbox"],
            });
            this.page = await this.browser.newPage();
            this.page.setDefaultTimeout(this.timeout);
            this.page.on("console", (msg) => console.log("PAGE LOG: ", msg.text()));
        }
        finally {
            this.log("init end");
        }
    }
    async signin() {
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
            await Promise.all([
                this.page.waitForNavigation(),
                this.page.click('a[href="/users/sign_in"]'),
            ]);
            await Promise.all([
                this.page.waitForNavigation(),
                this.page.click('a[href^="/sign_in/email"]'),
            ]);
            await this.page.type('input[name="mfid_user[email]"]', this.moneyforwardEmail);
            await Promise.all([
                this.page.waitForNavigation(),
                this.page.click('input[type="submit"]'),
            ]);
            await this.page.type('input[name="mfid_user[password]"]', this.moneyforwardPass);
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
        }
        finally {
            this.log("signin end");
        }
    }
    async run() {
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
            // await this.page.screenshot({
            //   path: "screenshot/moneyforward_portfolio_1.png",
            //   fullPage: true,
            // });
            // Summary
            const summaryEl = await this.page.$("div.heading-radius-box");
            const summaryStr = await (summaryEl === null || summaryEl === void 0 ? void 0 : summaryEl.evaluate((x) => x.innerHTML));
            const summary = [
                {
                    種類: "資産総額",
                    残高: summaryStr
                        .replace(/[^0-9,]*([0-9,]+円)\n/, "$1")
                        .replace(/\r?\n/g, ""),
                    balance: this.toNormalNumber(summaryStr),
                },
            ];
            console.log({ summary });
            // Assets
            const assetsOut = await this.page.$eval("section.bs-total-assets table tbody", (tbody) => [...tbody.rows].map((row) => {
                const kind = row.cells[0].innerText.trim();
                const balance = row.cells[1].innerText.trim();
                return { 種類: kind, 残高: balance };
            }));
            const assets = _.map(assetsOut, (asset) => {
                return Object.assign(Object.assign({}, asset), { balance: this.toNormalNumber(asset.残高) });
            });
            console.log({ assets });
            // portfolio_det_depo
            const detDepoOut = await this.page.$eval("section#portfolio_det_depo table", this.getTableData);
            const detDepo = _.map(detDepoOut, (depo) => {
                if (Object.hasOwnProperty.call(depo, "残高")) {
                    return Object.assign(Object.assign({}, depo), { balance: this.toNormalNumber(depo.残高) });
                }
                return Object.assign(Object.assign({}, depo), { balance: 0 });
            });
            console.log({ detDepo });
            // portfolio_det_eq
            const detEqOut = await this.page.$eval("section#portfolio_det_eq table", this.getTableData);
            const detEq = _.map(detEqOut, (eq) => {
                if (Object.hasOwnProperty.call(eq, "評価額")) {
                    return Object.assign(Object.assign({}, eq), { balance: this.toNormalNumber(eq.評価額) });
                }
                return Object.assign(Object.assign({}, eq), { balance: 0 });
            });
            console.log({ detEq });
            // portfolio_det_mf
            const detMfOut = await this.page.$eval("section#portfolio_det_mf table", this.getTableData);
            const detMf = _.map(detMfOut, (mf) => {
                if (Object.hasOwnProperty.call(mf, "評価額")) {
                    return Object.assign(Object.assign({}, mf), { balance: this.toNormalNumber(mf.評価額) });
                }
                return Object.assign(Object.assign({}, mf), { balance: 0 });
            });
            console.log({ detMf });
            // portfolio_det_fx
            const detFxOut = await this.page.$eval("section#portfolio_det_fx table", this.getTableData);
            const detFx = _.map(detFxOut, (fx) => {
                if (Object.hasOwnProperty.call(fx, "残高")) {
                    return Object.assign(Object.assign({}, fx), { balance: this.toNormalNumber(fx.残高) });
                }
                return Object.assign(Object.assign({}, fx), { balance: 0 });
            });
            console.log({ detFx });
            // portfolio_det_po
            const detPoOut = await this.page.$eval("section#portfolio_det_po table", this.getTableData);
            const detPo = _.map(detPoOut, (po) => {
                if (Object.hasOwnProperty.call(po, "現在の価値")) {
                    return Object.assign(Object.assign({}, po), { balance: this.toNormalNumber(po.現在の価値) });
                }
                return Object.assign(Object.assign({}, po), { balance: 0 });
            });
            console.log({ detPo });
            this.portfolio = Object.assign(Object.assign({}, this.portfolio), { summary,
                assets,
                detDepo,
                detEq,
                detMf,
                detFx,
                detPo });
            console.log({ portfolio: this.portfolio });
            if (fs.existsSync(this.portfolioPath)) {
                const portfolio = JSON.parse(fs.readFileSync(this.portfolioPath, "utf-8"));
                const newPortfolio = _.concat(portfolio, this.portfolio);
                fs.writeFileSync(this.portfolioPath, JSON.stringify(newPortfolio));
            }
            else {
                fs.writeFileSync(this.portfolioPath, JSON.stringify([this.portfolio]));
            }
            // const history = JSON.parse(fs.readFileSync(this.portfolioPath, "utf-8"));
            const sbi1 = await this.filterDetDepo("代表口座 - 円普通", "住信SBIネット銀行");
            const sbi2 = await this.filterDetDepo("SBIハイブリッド預金", "住信SBIネット銀行");
            const sbi = _.zipWith(sbi1, sbi2, (a, b) => a + b);
            console.log({ sbi });
            const smbc = await this.filterDetDepo("残高別普通預金残高", "三井住友銀行");
            console.log({ smbc });
            const ufj = await this.filterDetDepo("普通預金", "三菱UFJ銀行");
            console.log({ ufj });
            const yucho = await this.filterDetDepo("二二八店 普通", "ゆうちょ銀行");
            console.log({ yucho });
            const coincheck1 = await this.filterDetDepo("ビットコイン残高", "coincheck");
            const coincheck2 = await this.filterDetDepo("Ripple残高", "coincheck");
            const coincheck3 = await this.filterDetDepo("Litecoin残高", "coincheck");
            const coincheck4 = await this.filterDetDepo("ビットコイン キャッシュ残高", "coincheck");
            const coincheck5 = await this.filterDetDepo("円残高", "coincheck");
            const coincheck = _.zipWith(coincheck1, coincheck2, coincheck3, coincheck4, coincheck5, (a, b, c, d, e) => a + b + c + d + e);
            console.log({ coincheck });
            const bitbank1 = await this.filterDetDepo("ビットコイン残高", "bitbank");
            const bitbank2 = await this.filterDetDepo("円残高", "bitbank");
            const bitbank = _.zipWith(bitbank1, bitbank2, (a, b) => a + b);
            console.log({ bitbank });
            const btcbox1 = await this.filterDetDepo("BTC残高", "BTCBOX");
            const btcbox2 = await this.filterDetDepo("JPY残高", "BTCBOX");
            const btcbox = _.zipWith(btcbox1, btcbox2, (a, b) => a + b);
            console.log({ btcbox });
            const bitFlyer1 = await this.filterDetDepo("ビットコイン残高", "bitFlyer");
            const bitFlyer2 = await this.filterDetDepo("Mona残高", "bitFlyer");
            const bitFlyer3 = await this.filterDetDepo("円残高", "bitFlyer");
            const bitFlyer = _.zipWith(bitFlyer1, bitFlyer2, bitFlyer3, (a, b, c) => a + b + c);
            console.log(bitFlyer);
            const liquid = await this.filterDetDepo("円残高", "Liquid by Quoine");
            console.log({ liquid });
            const geo = await this.filterDetEq("2681");
            console.log({ geo });
            const aeon = await this.filterDetEq("8267");
            console.log({ aeon });
            const oneOpen = await this.filterDetMf("One-MHAM新興成長株オープン");
            console.log({ oneOpen });
            const worldIndex = await this.filterDetMf("三井住友TAM-世界経済インデックスファンド");
            console.log({ worldIndex });
            const total = _.zipWith(sbi, smbc, ufj, yucho, coincheck, bitbank, btcbox, bitFlyer, liquid, geo, aeon, oneOpen, worldIndex, (x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11, x12, x13) => x1 + x2 + x3 + x4 + x5 + x6 + x7 + x8 + x9 + x10 + x11 + x12 + x13);
            console.log({ total });
            const times = JSON.parse(await jq.run("[.[].time]", this.portfolioPath, { input: "file" }));
            const label = total.map((x, idx) => (idx === total.length - 1 ? x : ""));
            const imgUrl = encodeURI(`https://image-charts.com/chart?cht=bvs&chxt=y&chd=a:${[
                sbi,
                smbc,
                ufj,
                yucho,
                coincheck,
                bitbank,
                btcbox,
                bitFlyer,
                liquid,
                geo,
                aeon,
                oneOpen,
                worldIndex,
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
                "FFFF00",
                "DDA0DD",
                "2F4F4F",
                "000000",
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
                "ゲオHD",
                "イオン",
                "One-MHAM新興成長株オープン",
                "三井住友TAM-世界経済インデックスファンド",
            ].join("|")}&chl=${label.join("|")}`);
            console.log(imgUrl);
            await this.page.goto(imgUrl, {
                waitUntil: ["load", "networkidle2"],
            });
            // await this.page.screenshot({
            //   path: "screenshot/portfolio.png",
            //   fullPage: true,
            // });
            const web = new web_api_1.WebClient(this.slackToken);
            // const res = (await web.files.upload({
            //   channels: "#portfolio",
            //   initial_comment: "現在の資産です！",
            //   filename: "portfolio.png",
            //   file: fs.createReadStream("screenshot/portfolio.png"),
            // })) as any;
            // console.log(`File uploaded: ${res.file.id}`);
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
                        image_url: imgUrl,
                        thumb_url: imgUrl,
                    },
                ],
            });
            console.log({ res });
            await this.browser.close();
        }
        catch (error) {
            this.log(error);
        }
        finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }
}
Gtmt.description = "Get my portfolio";
Gtmt.flags = {
    // add --version flag to show CLI version
    version: command_1.flags.version({ char: "v" }),
    help: command_1.flags.help({ char: "h" }),
    // flag with no value (-f, --force)
    force: command_1.flags.boolean({ char: "f" }),
};
module.exports = Gtmt;
