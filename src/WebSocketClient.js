class EventHandler {
  constructor() {
    this._stores = {}
  }

  on(event, fn, ctx) {
    if (typeof fn !== 'function') {
      throw new Error('listener must be a function');
    }
    if (!this._stores[event]) {
      this._stores[event] = []
    }
    this._stores[event].push({cb: fn, ctx: ctx});
  }

  emit(event) {
    const store = this._stores[event];
    if (!store) return;
    const args = Array.prototype.slice.call(arguments, 1);
    for (let i = 0; i < store.length; i++) {
      store[i].cb.apply(store[i].ctx, args);
    }
    return true;
  }

  off(event, fn) {
    if (!arguments.length) {
      this._stores = {};
      return;
    }
    const store = this._stores[event];
    if (!store) return false;
    if (!fn) {
      this._stores[event] = [];
      return;
    }
    for (let i = store.length - 1; i >= 0; i--) {
      if (store[i].cb === fn) {
        store.splice(i, 1);
      }
    }
  }
}

/**
 * 解析url
 * @param {string} url
 * @return object
 */
function parseUrl(url) {
  const regex = /^(?<protocol>[\w-]+):\/\/(?<host>[\w.-]+)(?::(?<port>\d+))?(?<path>\/\w*)?(?:\?(?<query>[\w=&]+))?(?:#(?<hash>[\w-]+))?$/
  const matches = url.match(regex);
  const protocol = matches.groups.protocol;
  const host = matches.groups.host;
  const port = matches.groups.port;
  const path = matches.groups.path || '';
  const query = matches.groups.query;
  const hash = matches.groups.hash || '';

  const queryParams = {};
  if (query) {
    const params = query.split("&");
    params.forEach(param => {
      const [key, value] = param.split("=");
      queryParams[key] = value;
    });
  }

  return {
    protocol,
    host,
    port,
    path,
    queryParams,
    hash
  };
}

/**
 * 构建url
 * @param data
 * @return {string}
 */
function buildUrl(data) {
  let url = data.protocol + "://" + data.host;
  if (data.port) {
    url += ":" + data.port;
  }
  if (data.path) {
    url += data.path;
  }
  const queryParams = Object.entries(data.queryParams);
  if (queryParams.length > 0) {
    const queryString = queryParams
        .map(([key, value]) => key + "=" + value)
        .join("&");
    url += "?" + queryString;
  }
  if (data.hash) {
    url += "#" + data.hash;
  }
  return url;
}

export default class WebSocketClient {
  static CONNECTING = WebSocket.CONNECTING;
  static OPEN = WebSocket.OPEN;
  static CLOSING = WebSocket.CLOSING;
  static CLOSED = WebSocket.CLOSED;

  static EVENT = {
    OPEN: 'open',
    CLOSE: 'close',
    ERROR: 'error',
    MESSAGE: 'message',
    CONNECTING: 'connecting',
  };

  event = new EventHandler();
  websocket = null;
  url = '';
  path = '';
  query = {};
  protocols = undefined;
  automaticOpen = true;// 自动连接
  reconnectAttempts = 0;// 重新连接尝试次数
  reconnectInterval = 1000; // 连接间隔
  reconnectDecay = 1.5;// 重新连接延迟的增加速率
  maxReconnectInterval = 30e3;// 最大连接间隔
  maxReconnectAttempts = null;// 最大重新连接次数
  openTimeoutInterval = 2000;// 连接超时时间
  binaryType = 'blob';
  pingInterval = 50e3;// 心跳间隔
  pingData = 'ping';// 心跳发送数据
  typeKey = 'type';// 消息类型key
  payloadKey = 'payload';// 消息载体key
  normalCloseCode = [1000];// 正常关闭code
  messageQueue = [];// 错误消息队列
  messageQueueTimeout = 300e3;// 错误消息超时时间
  protocol = null;
  readyState = WebSocket.CONNECTING;// 连接状态
  heartCheckTimer = null;// 心跳定时器

  constructor(url, options = {}) {
    for (const key in options) {
      if (!this.hasOwnProperty(key)) {
        throw new Error(`this option "${key}" is not defined`)
      }
      this[key] = options[key];
    }

    const parsedUrl = parseUrl(url)
    if (this.path) {
      parsedUrl.path = this.path;
    }
    Object.assign(parsedUrl.queryParams, this.query)
    this.url = buildUrl(parsedUrl)
    console.log(this.url)
    if (this.automaticOpen === true) {
      this.open(false);
    }
  }

  open(reconnectAttempt = false) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      return;
    }
    let websocket = this.websocket = new WebSocket(this.url, this.protocols);
    websocket.binaryType = this.binaryType;
    if (reconnectAttempt) {
      if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
        return;
      }
    } else {
      this.event.emit(WebSocketClient.EVENT.CONNECTING);
      this.reconnectAttempts = 0;
    }

    const openTimeout = setTimeout(() => {
      if (websocket) {
        websocket.close();
      }
    }, this.openTimeoutInterval)

    websocket.onopen = (e) => {
      clearTimeout(this.heartCheckTimer)
      clearTimeout(openTimeout)
      this.protocol = websocket.protocol;
      this.readyState = WebSocket.OPEN;
      this.reconnectAttempts = 0;
      this.event.emit(WebSocketClient.EVENT.OPEN, e, {reconnectAttempt: reconnectAttempt})
      this.heartCheckStart()

      const currentTime = new Date();
      while (this.messageQueue.length > 0) {
        const {pushTime, message} = this.messageQueue.shift();
        if (this.messageQueueTimeout <= 0 || currentTime - pushTime <= this.messageQueueTimeout) {
          this.sendRaw(message)
        }
      }
    };

    websocket.onclose = (e) => {
      clearTimeout(this.heartCheckTimer)
      clearTimeout(openTimeout)
      websocket = null;
      this.websocket = null;
      if (this.normalCloseCode.includes(e.code)) {
        this.readyState = WebSocket.CLOSED;
        this.event.emit(WebSocketClient.EVENT.CLOSE, e)
        return;
      }
      this.readyState = WebSocket.CONNECTING;
      this.event.emit(WebSocketClient.EVENT.CONNECTING, e)

      const reconnectTime = Math.min(this.maxReconnectInterval, this.reconnectInterval * Math.pow(this.reconnectDecay, this.reconnectAttempts));
      setTimeout(() => {
        this.reconnectAttempts++;
        this.open(true);
      }, reconnectTime);
    }

    websocket.onmessage = (e) => {
      this.event.emit(WebSocketClient.EVENT.MESSAGE, e.data)
      try {
        const obj = JSON.parse(e.data)
        if (typeof obj === 'object' && obj[this.typeKey]) {
          this.event.emit(obj[this.typeKey], obj[this.payloadKey])
        }
      } catch (err) {
      }
    };
    websocket.onerror = (e) => {
      this.event.emit(WebSocketClient.EVENT.ERROR, e)
    };
  }

  on(event, callback) {
    this.event.on(event, callback, this)
    return this;
  }

  off(event, callback) {
    this.event.off(event, callback)
    return this;
  }

  send(type, payload = {}) {
    if (!type || typeof type !== 'string') {
      throw TypeError('type must be a string');
    }
    return this.sendRaw({
      [this.typeKey]: type,
      [this.payloadKey]: payload
    });
  }

  sendRaw(message) {
    if (this.readyState === WebSocket.OPEN) {
      if (!this.websocket) {
        return;
      }
      if (typeof message !== 'object' || message instanceof ArrayBuffer || message instanceof Blob) {
        this.websocket.send(message)
      } else if (message === null || message === undefined) {
        this.websocket.send('');
      } else {
        this.websocket.send(JSON.stringify(message))
      }
    } else {
      this.messageQueue.push({
        pushTime: new Date(),
        message: message,
      })
    }
  }

  close(code = 1000, reason = '') {
    if (this.websocket) {
      this.websocket.close(code, reason)
    }
  }

  heartCheckStart() {
    if (this.pingInterval === false) {
      return;
    }
    clearTimeout(this.heartCheckTimer);
    this.heartCheckTimer = setTimeout(() => {
      if (this.readyState === WebSocket.OPEN) {
        this.sendRaw(this.pingData);
        this.heartCheckStart();
      }
    }, this.pingInterval)
  }
}
