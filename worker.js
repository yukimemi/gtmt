const CronJob = require("cron").CronJob;

const workerJob = new CronJob({
  cronTime: "0 6 * * *",
  // cronTime: "*/1 * * * *",
  onTick: function () {
    console.log("onTick start !");
    const fs = require("fs");
    const path = require("path");

    require("./lib").run().catch(require("@oclif/errors/handle"));

    console.log("onTick end !");
  },
  start: true,
  timeZone: "Asia/Tokyo",
});
console.log("worker start !");
workerJob.start();
