import {Command, flags} from '@oclif/command'

class Gtmt extends Command {
  static description = 'Get my portfolio'

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    // flag with no value (-f, --force)
    force: flags.boolean({char: 'f'}),
  }

  async run() {
    const {args, flags} = this.parse(Gtmt)

    this.log(`hello from ./src/index.ts`)
    if (flags.force) {
      this.log(`you input --force`)
    }
  }
}

export = Gtmt
