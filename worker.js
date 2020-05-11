const CronJob = require("cron").CronJob;

const workerJob = new CronJob({
  cronTime: "0 6 * * *",
  onTick: function () {
    const fs = require("fs");
    const path = require("path");
    const project = path.join(__dirname, "tsconfig.json");
    const dev = fs.existsSync(project);

    if (dev) {
      require("ts-node").register({ project });
    }

    require(`./${dev ? "src" : "lib"}`)
      .run()
      .catch(require("@oclif/errors/handle"));
  },
  start: true,
  timeZone: "Asia/Tokyo",
});
workerJob.start();
