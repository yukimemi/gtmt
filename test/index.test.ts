import { expect, test } from "@oclif/test";

import cmd = require("../src");

describe("gtmt", () => {
  test
    .stdout()
    .do(() => cmd.run([]))
    .it("runs hello", ctx => {
      expect(ctx.stdout).to.contain("hello world");
    });

  test
    .stdout()
    .do(() => cmd.run(["--name", "jeff"]))
    .it("runs hello --name jeff", ctx => {
      console.log(ctx.stdout);
      expect(ctx.stdout).to.contain("hello jeff");
    });

  test
    .stdout()
    .do(() => cmd.run(["--version"]))
    .it("runs hello -v", ctx => {
      console.log(ctx.stdout);
      expect(ctx.stdout).to.contain(process.env.npm_package_version as string);
    });
});
