import { expect, test } from "@oclif/test";

import cmd = require("../src");

describe("gtmt", () => {
  test
    .stdout()
    .do(() => cmd.run([]))
    .it("runs gtmt", (ctx) => {
      expect(ctx.stdout).to.contain("hello");
    });
});
