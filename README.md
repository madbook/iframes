# r/iframes
A library for interacting with `<iframes />`.

## Change Log
#### v0.0.0
Initial release

#### v0.1.1
Transform modules to commonjs

## Installation
yarn add @r/frames -s

## Usage example
```es6
import * as frames from '@r/frames';

// parent window
frames.listen('dfp');
frames.receiveMessageOnce('init.dfp', () => {
  // do stuff.
});

// iframe
frames.postMessage(window.parent, 'init.dfp', data);
```

## TODO
1. Add tests
1. Convert to typescript