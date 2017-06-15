/** @module frames */
/* @example
 * // parent window
 * // frames.listen('dfp')
 * // frames.receiveMessageOnce('init.dfp', callback)
 * @example
 * // iframe
 * // frames.postMessage(window.parent, 'init.dfp', data);
 */

const ALLOW_WILDCARD = '.*';
const DEFAULT_MESSAGE_NAMESPACE = '.postMessage';
const DEFAULT_POSTMESSAGE_OPTIONS = {
  targetOrigin: '*',
};
const RE_HAS_NAMESPACE = /\..+$/;

function compileNamespaceRegExp(namespaces) {
  return new RegExp(`\\.(?:${namespaces.join('|')})$`);
}

function compileOriginRegExp(origins) {
  return new RegExp(`^http(s)?:\\/\\/${origins.join('|')}$`, 'i');
}

let allowedOrigins = [ALLOW_WILDCARD];
let postMessageAllowedOriginRegex = compileOriginRegExp(allowedOrigins);
const messageNamespaces = [DEFAULT_MESSAGE_NAMESPACE];
let messageNamespacesRegex = compileNamespaceRegExp(messageNamespaces);
const proxies = {};
let listening = false;

function addEventListener(type, handler, useCapture) {
  if (global.addEventListener) {
    global.addEventListener(type, handler, useCapture);
  } else if (global.attachEvent) {
    global.attachEvent(`on${type}`, handler);
  }
}

function removeEventListener(type, handler) {
  if (global.removeEventListener) {
    global.removeEventListener(type, handler);
  } else if (global.detachEvent) {
    global.detachEvent(`on${type}`, handler);
  }
}

function isWildcard(origin) {
  return /\*/.test(origin);
}

/*
 * Send a message to another window.
 * param {Window} target The frame to deliver the message to.
 * param {String} type The message type. (if it doesn't include a namespace
   the default namespace will be used)
 * param {Object} data The data to send.
 * param {Object} options The `postMessage` options.
 * param {String} options.targetOrigin Specifies what the origin of
   otherWindow must be for the event to be dispatched.
 */
export const postMessage = (target, type, data, options = {}) => {
  if (!RE_HAS_NAMESPACE.test(type)) {
    // eslint-disable-next-line no-param-reassign
    type += DEFAULT_MESSAGE_NAMESPACE;
  }

  const defaultedOptions = options;
  Object.keys(DEFAULT_POSTMESSAGE_OPTIONS).forEach((key) => {
    defaultedOptions[key] = DEFAULT_POSTMESSAGE_OPTIONS[key];
  });

  target.postMessage(JSON.stringify({
    type,
    data,
    defaultedOptions,
  }), defaultedOptions.targetOrigin);
};

/*
 * Receive a message from another window.
 * param {Window} [source] The frame to that send the message.
 * param {String} type The message type. (if it doesn't include a namespace
   the default namespace will be used)
 * param {Function} callback The callback to invoke upon retrieval.
 * param {Object} [context=this] The context the callback is invoked with.
 * returns {Object} The listener.
 */
export const receiveMessage = (source, type, callback, context) => {
  /* eslint-disable no-param-reassign */
  if (typeof source === 'string') {
    context = callback;
    callback = type;
    type = source;
    source = null;
  }

  context = context || this;
  /* eslint-enable no-param-reassign */

  const scoped = (e, ...rest) => {
    if (source &&
        source !== e.source &&
        source.contentWindow !== e.source) {
      return;
    }

    callback.apply(context, e, ...rest);
  };

  addEventListener(type, scoped);

  return {
    off() { removeEventListener(type, scoped); },
  };
};

/*
 * Receive a message from another window once.
 * param {Window} [source] The frame to that send the message.
 * param {String} type The message type. (if it doesn't include a namespace
   the default namespace will be used)
 * param {Function} callback The callback to invoke upon retrieval.
 * param {Object} [context=this] The context the callback is invoked with.
 * returns {Object} The listener.
 */
export const receiveMessageOnce = (source, type, callback, context) => {
  const listener = receiveMessage(source, type, () => {
    if (callback) {
      callback.apply(this, arguments);
    }

    listener.off();
  }, context);

  return listener;
};

/*
 * Removes an origin from the list of those listened to.
 * param {String} origin The origin to be removed.
 */
export const removePostMessageOrigin = (origin) => {
  const index = allowedOrigins.indexOf(origin);

  if (index !== -1) {
    allowedOrigins.splice(index, 1);

    postMessageAllowedOriginRegex = compileOriginRegExp(allowedOrigins);
  }
};

/*
 * Adds an allowed origin to be listened to.
 * param {String} origin The origin to be added.
 */
export const addPostMessageOrigin = (origin) => {
  if (isWildcard(origin)) {
    allowedOrigins = [ALLOW_WILDCARD];
  } else if (allowedOrigins.indexOf(origin) === -1) {
    removePostMessageOrigin(ALLOW_WILDCARD);

    allowedOrigins.push(origin);

    postMessageAllowedOriginRegex = compileOriginRegExp(allowedOrigins);
  }
};

function handleReceiveMessage(e) {
  if (e.origin !== global.location.origin &&
      !postMessageAllowedOriginRegex.test(e.origin)
      && e.origin !== 'null') {
    return;
  }

  const message = JSON.parse(e.data);
  const type = message.type;

  // Namespace doesn't match, ignore
  if (!messageNamespacesRegex.test(type)) {
    return;
  }

  const namespace = type.split('.', 2)[1];

  if (proxies[namespace]) {
    const proxyWith = proxies[namespace];

    proxyWith.targets.forEach(target => (
      postMessage(target, type, message.data, message.options)
    ));
  }

  const customEvent = new CustomEvent(type, { detail: message.data });
  customEvent.source = e.source;

  global.dispatchEvent(customEvent);
}

/*
 * Listens to messages on of the specified namespace.
 * param {String} namespace The namespace to be listened to.
 */
export const listen = (namespace) => {
  if (messageNamespaces.indexOf(namespace) === -1) {
    messageNamespaces.push(namespace);
    messageNamespacesRegex = compileNamespaceRegExp(messageNamespaces);
  }

  if (!listening) {
    addEventListener('message', handleReceiveMessage);

    listening = true;
  }
};

/*
 * Stops listening to messages on of the specified namespace.
 * param {String} namespace The namespace to stop listening to.
 */
export const stopListening = (namespace) => {
  const index = messageNamespaces.indexOf(namespace);

  if (index !== -1) {
    messageNamespaces.splice(index, 1);

    if (messageNamespaces.length) {
      messageNamespacesRegex = compileNamespaceRegExp(messageNamespaces);
    } else {
      removeEventListener('message', handleReceiveMessage);
      listening = false;
    }
  }
};

/*
 * Proxies messages on a namespace from a frame to a specified target.
 * param {String} namespace The namespace to proxy.
 * targets {Array<Window>} [source] The frames to proxy messages to.
 *  NOTE: supports a single frame as well.
 */
export const proxy = (namespace, targets) => {
  listen(namespace);

  if (!Array.isArray(targets)) {
    // eslint-disable-next-line no-param-reassign
    targets = [targets];
  }

  let namespaceProxies = proxies[namespace];

  if (namespaceProxies) {
    namespaceProxies.targets = [].concat(namespaceProxies.targets, targets);
  } else {
    namespaceProxies = {
      targets,
    };
  }

  proxies[namespace] = namespaceProxies;
};
