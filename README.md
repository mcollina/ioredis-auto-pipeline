# ioredis-auto-pipeline

Automatic redis pipeline support.
It can increase your throughput by up to 100%.
See https://redis.io/topics/pipelining for more details.

All builtin commands are supported, minus subscribe and psubscribe.

## Install

```
npm install ioredis-auto-pipeline
```

## API Example

```js
const Redis = require('ioredis')
const auto = require('ioredis-auto-pipeline')

async function run () {
  const redis = auto(new Redis())

  console.log(redis.queued) // number of ops in the queue

  // In any part of your code, call pipeline()
  // to schedule a command to be executed in the next
  // batch of commands.
  const results = await Promise.all([
    redis.get('foo'),
    redis.get('foo'),
    redis.get('foo'),
    redis.get('foo'),
    redis.get('foo')
  ])

  console.log(results)
  await redis.quit()
}

run()
```

Callback style is also supported:

```js
const Redis = require('ioredis')
const auto = require('ioredis-auto-pipeline')
const async = require('async')
const redis = auto(new Redis())
async.parallel([
  (cb) => { redis.get('foo', cb)) },
  (cb) => { redis.get('bar', cb)) },
], (err, results) => {
  if (err) console.error(err)
  else console.log(results)
  redis.quit()
})
```

## Preload

To automatically instrument every usage of `ioredis` with `ioredis-auto-pipeline` this module can be used as a preloader like so:

```sh
node -r ioredis-auto-pipeline app.js
```

When using the preloader, to opt-out of pipelined commands use the `redis.single`, for example

```js
const Redis = require('ioredis')
const redis = new Redis()
async function run () {
  await redis.single.get('foo') // run a command without pipelining
}
```


## License

MIT
