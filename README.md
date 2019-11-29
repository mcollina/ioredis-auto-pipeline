# ioredis-auto-pipeline

Automatic redis pipeline support.
It can increase your throughput by up to 100%.
See https://redis.io/topics/pipelining for more details.

All builtin commands are supported, minus subscribe and psubscribe.

## Install

```
npm ioredis-auto-pipeline
```

## Example

```js
const Redis = require('ioredis')
const auto = require('ioredis-auto-pipeline')

async function run () {
  const redis = new Redis()
  const pipeline = auto(redis)

  console.log(pipeline.queued) // number of ops in the queue

  // In any part of your code, call pipeline()
  // to schedule a command to be executed in the next
  // batch of commands.
  const results = await Promise.all([
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo'),
    pipeline.get('foo')
  ])

  console.log(results)
  await redis.quit()
}

run()
```

## License

MIT
