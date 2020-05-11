const CronJob = require("cron").CronJob;

const workerJob = new CronJob({
  cronTime: "*/1 * * * *",
  onTick: function () {
    console.log("onTick start !");
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

    console.log("onTick end !");
  },
  start: true,
  timeZone: "Asia/Tokyo",
});
console.log("worker start !");
workerJob.start();
