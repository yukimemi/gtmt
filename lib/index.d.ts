import { Command } from "@oclif/command";
import puppeteer from "puppeteer";
declare class Gtmt extends Command {
    static description: string;
    static flags: {
        version: import("@oclif/parser/lib/flags").IBooleanFlag<void>;
        help: import("@oclif/parser/lib/flags").IBooleanFlag<void>;
        force: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
    };
    headless: boolean;
    slowMo: number;
    devtools: boolean;
    timeout: number;
    moneyforwardEmail: string | undefined;
    moneyforwardPass: string | undefined;
    slackToken: string | undefined;
    portfolioRepo: string | undefined;
    portfolioUser: string | undefined;
    portfolioPass: string | undefined;
    cookiesPath: string;
    portfolioPath: string;
    filterPortfolio: string[];
    browser: puppeteer.Browser;
    page: puppeteer.Page;
    portfolio: object;
    toNormalNumber(yen?: string): string;
    getTableData(table: Element): object;
    filterBalance(str: string): Promise<number[]>;
    filterDetDepo(fil1: string, fil2: string): Promise<number[]>;
    filterDetEq(fil1: string): Promise<number[]>;
    filterDetMf(fil1: string): Promise<number[]>;
    init(): Promise<void>;
    signin(): Promise<void>;
    run(): Promise<void>;
}
export = Gtmt;
