(function (global, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.WebSocketClient = factory();
  }
})(this, function () {
  "use strict"
  var WebSocketClass;
  if ('WebSocket' in window) {
    WebSocketClass = WebSocket;
  } else if ('MozWebSocket' in window) {
    WebSocketClass = MozWebSocket;
  } else {
    throw new Error('you browser do not support WebSocket')
  }

  function EventHandler() {
    this._stores = {}
  }

  EventHandler.prototype.on = function (event, fn, ctx) {
    if (typeof fn !== 'function') {
      throw new Error('listener must be a function');
    }
    if (!this._stores[event]) {
      this._stores[event] = []
    }
    this._stores[event].push({cb: fn, ctx: ctx});
  }

  EventHandler.prototype.emit = function (event) {
    var store = this._stores[event];
    if (!store) return;
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < store.length; i++) {
      store[i].cb.apply(store[i].ctx, args);
    }
    return true;
  }

  EventHandler.prototype.off = function (event, fn) {
    if (!arguments.length) {
      this._stores = {};
      return;
    }
    var store = this._stores[event];
    if (!store) return false;
    if (!fn) {
      this._stores[event] = [];
      return;
    }
    for (var i = store.length - 1; i >= 0; i--) {
      if (store[i].cb === fn) {
        store.splice(i, 1);
      }
    }
  }

  function includes(arr, value) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === value) {
        return true;
      }
    }
    return false;
  }

  /**
   * 解析url
   * @param {string} url
   * @return object
   */
  function parseUrl(url) {
    var regex = /^([\w-]+):\/\/([\w.-]+)(?::(\d+))?(\/\w*)?(?:\?([\w=&]+))?(?:#([\w-]+))?$/
    var matches = url.match(regex);
    if (!matches) {
      throw new TypeError('url parameter error: ' + url)
    }
    var protocol = matches[1];
    var host = matches[2];
    var port = matches[3];
    var path = matches[4] || '';
    var query = matches[5];
    var hash = matches[6] || '';

    var queryParams = {};
    if (query) {
      var params = query.split("&");
      params.forEach(function (param) {
        var item = param.split("=");
        queryParams[item[0]] = item[1];
      });
    }

    return {
      protocol: protocol,
      host: host,
      port: port,
      path: path,
      queryParams: queryParams,
      hash: hash
    };
  }

  /**
   * 构建url
   * @param data
   * @return {string}
   */
  function buildUrl(data) {
    var url = data.protocol + "://" + data.host;
    if (data.port) {
      url += ":" + data.port;
    }
    if (data.path) {
      url += data.path;
    }

    var args = []
    for (var key in data.queryParams) {
      var value = data.queryParams[key]
      args.push(encodeURIComponent(key) + "=" + encodeURIComponent(value))
    }
    if (args.length > 0) {
      url += "?" + args.join('&');
    }
    if (data.hash) {
      url += "#" + data.hash;
    }
    return url;
  }

  function WebSocketClient(url, options) {
    this.event = new EventHandler();
    this.websocket = null;
    this.url = '';
    this.path = '';
    this.query = {};
    this.protocols = undefined;
    this.automaticOpen = true;// 自动连接
    this.reconnectAttempts = 0;// 重新连接尝试次数
    this.reconnectInterval = 1000; // 连接间隔
    this.reconnectDecay = 1.5;// 重新连接延迟的增加速率
    this.maxReconnectInterval = 30e3;// 最大连接间隔
    this.maxReconnectAttempts = null;// 最大重新连接次数
    this.openTimeoutInterval = 2000;// 连接超时时间
    this.binaryType = 'blob';
    this.pingInterval = 50e3;// 心跳间隔
    this.pingData = 'ping';// 心跳发送数据
    this.typeKey = 'type';// 消息类型key
    this.payloadKey = 'payload';// 消息载体key
    this.normalCloseCode = [1000];// 正常关闭code
    this.messageQueue = [];// 错误消息队列
    this.messageQueueTimeout = 300e3;// 错误消息超时时间
    this.protocol = null;
    this.readyState = null;// 连接状态
    this.heartCheckTimer = null;// 心跳定时器

    if (!options) {
      options = {};
    }
    for (var key in options) {
      if (!this.hasOwnProperty(key)) {
        throw new Error('this option "' + key + '" is not defined')
      }
      this[key] = options[key];
    }

    var parsedUrl = parseUrl(url)
    if (this.path) {
      parsedUrl.path = this.path;
    }
    for (var item in this.query) {
      parsedUrl.queryParams[item] = this.query[item]
    }
    this.url = buildUrl(parsedUrl)
    this.readyState = WebSocketClass.CONNECTING
    if (this.automaticOpen === true) {
      this.open(false);
    }
  }

  WebSocketClient.CONNECTING = WebSocketClass.CONNECTING;
  WebSocketClient.OPEN = WebSocketClass.OPEN;
  WebSocketClient.CLOSING = WebSocketClass.CLOSING;
  WebSocketClient.CLOSED = WebSocketClass.CLOSED;

  WebSocketClient.EVENT = {
    OPEN: 'open',
    CLOSE: 'close',
    ERROR: 'error',
    MESSAGE: 'message',
    CONNECTING: 'connecting',
  };

  WebSocketClient.prototype.open = function (reconnectAttempt) {
    var _this = this;
    if (this.websocket && this.websocket.readyState === WebSocketClass.OPEN) {
      return;
    }
    var websocket = new WebSocket(this.url, this.protocols);
    this.websocket = websocket;
    websocket.binaryType = this.binaryType;
    if (reconnectAttempt) {
      if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
        return;
      }
    } else {
      this.event.emit(WebSocketClient.EVENT.CONNECTING);
      this.reconnectAttempts = 0;
    }

    var openTimeout = setTimeout(function () {
      if (websocket) {
        websocket.close();
      }
    }, this.openTimeoutInterval)

    websocket.onopen = function (e) {
      clearTimeout(this.heartCheckTimer)
      clearTimeout(openTimeout)
      _this.protocol = websocket.protocol;
      _this.readyState = WebSocketClass.OPEN;
      _this.reconnectAttempts = 0;
      _this.event.emit(WebSocketClient.EVENT.OPEN, e, {reconnectAttempt: reconnectAttempt})
      _this.heartCheckStart()

      var currentTime = new Date();
      while (_this.messageQueue.length > 0) {
        var item = _this.messageQueue.shift();
        if (_this.messageQueueTimeout <= 0 || currentTime - item.pushTime <= _this.messageQueueTimeout) {
          _this.sendRaw(item.message)
        }
      }
    };

    websocket.onclose = function (e) {
      clearTimeout(this.heartCheckTimer)
      clearTimeout(openTimeout)
      websocket = null;
      _this.websocket = null;
      if (includes(_this.normalCloseCode, e.code)) {
        _this.readyState = WebSocketClass.CLOSED;
        _this.event.emit(WebSocketClient.EVENT.CLOSE, e)
        return;
      }
      _this.readyState = WebSocketClass.CONNECTING;
      _this.event.emit(WebSocketClient.EVENT.CONNECTING, e)

      var reconnectTime = Math.min(_this.maxReconnectInterval, _this.reconnectInterval * Math.pow(_this.reconnectDecay, _this.reconnectAttempts));
      setTimeout(function () {
        _this.reconnectAttempts++;
        _this.open(true);
      }, reconnectTime);
    }

    websocket.onmessage = function (e) {
      _this.event.emit(WebSocketClient.EVENT.MESSAGE, e.data)
      try {
        var obj = JSON.parse(e.data)
        if (typeof obj === 'object' && obj[_this.typeKey]) {
          _this.event.emit(obj[_this.typeKey], obj[_this.payloadKey])
        }
      } catch (err) {
      }
    };
    websocket.onerror = function (e) {
      _this.event.emit(WebSocketClient.EVENT.ERROR, e)
    };
  }

  WebSocketClient.prototype.on = function (event, callback) {
    this.event.on(event, callback, this)
    return this;
  }

  WebSocketClient.prototype.off = function (event, callback) {
    this.event.off(event, callback)
    return this;
  }

  WebSocketClient.prototype.send = function (type, payload) {
    if (!type || typeof type !== 'string') {
      throw TypeError('type must be a string');
    }
    var data = {}
    data[this.typeKey] = type
    data[this.payloadKey] = payload
    return this.sendRaw(data);
  }

  WebSocketClient.prototype.sendRaw = function (message) {
    if (this.readyState === WebSocketClass.OPEN) {
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

  WebSocketClient.prototype.close = function (code, reason) {
    if (typeof code === 'undefined') {
      code = 1000;
    }
    if (this.websocket) {
      this.websocket.close(code, reason)
    }
  }

  WebSocketClient.prototype.heartCheckStart = function () {
    if (this.pingInterval === false) {
      return;
    }
    var _this = this;
    clearTimeout(this.heartCheckTimer);
    this.heartCheckTimer = setTimeout(function () {
      if (_this.readyState === WebSocketClass.OPEN) {
        _this.sendRaw(_this.pingData);
        _this.heartCheckStart();
      }
    }, this.pingInterval)
  }

  return WebSocketClient;
})
