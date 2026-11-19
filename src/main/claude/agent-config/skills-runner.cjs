// Electron utility processes stay alive when the Node event loop is idle.
// A Node worker gives the unmodified CLI its normal command-line lifecycle.
const { finished } = require('node:stream/promises')
const { Worker } = require('node:worker_threads')

const [entry, ...args] = process.argv.slice(2)
const worker = new Worker(entry, { argv: args, stdout: true, stderr: true })
worker.stdout.pipe(process.stdout, { end: false })
worker.stderr.pipe(process.stderr, { end: false })
worker.on('error', (error) => console.error(error))

worker.once('exit', async (code) => {
  await Promise.all([finished(worker.stdout), finished(worker.stderr)])
  // process.exit can otherwise truncate the final rows on a buffered pipe.
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) => new Promise((resolve) => stream.write('', resolve)),
    ),
  )
  process.exit(code)
})
