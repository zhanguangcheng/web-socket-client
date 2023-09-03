# web-socket-client

WebSocketClient是对WebSocket的封装，以便支持常用的功能，如：断线重连、心跳检测、消息分类、失败消息重发等等。

## 功能
- 建立 WebSocket 连接，并支持path、query 参数。
- 发送、接收消息，支持对 WebSocket 的事件进行监听。
- 异常情况断开重连、用户手动断开则不重连
- 支持心跳检测，防止异常情况（掉电、断网、防火墙关闭长时间不通讯的连接等）
- 消息发送失败时，下次连接成功时发送之前失败的内容
- 根据不同的类型，发送和接受不同的消息

## 安装

浏览器script引入
```html
<script src="./src/web-socket-client.min.js"></script>
```

使用import导入
```js
import WebSocketClient from './src/WebSocketClient.js'
```

## 使用示例
```js
var client = new WebSocketClient('ws://127.0.0.1:8282', {
  path: '/websocket',
  query: {
    token: 'xxx',
  }
})
var EVENT = WebSocketClient.EVENT;

// 连接成功
client.on(EVENT.OPEN, function(e) {
  console.log(EVENT.OPEN, e)
  
  // 发送消息
  client.send('login', {
    user: 'Grass'
  })
  
  // 发送原始消息
  client.sendRaw('hello')
})

// 连接正常关闭
client.on(EVENT.CLOSE, function(e) {
  console.log(EVENT.CLOSE, e)
})

// 发生错误
client.on(EVENT.ERROR, function(e) {
  console.log(EVENT.ERROR, e)
})

// 重连中
client.on(EVENT.CONNECTING, function(e) {
  console.log(EVENT.CONNECTING, e)
})

// 收到消息
client.on(EVENT.MESSAGE, function(data) {
  console.log(EVENT.MESSAGE, data)
})

// 收到自定义消息分类
client.on('custom', function(data) {
  console.log('custom', data)
})
```

## 参数
```js
var client = new WebSocketClient(url, options);
```

### `url`
- 要连接到的 WebSocket 服务地址。

### `options`
- 选项配置


## 选项 options
### `protocols`
- 根据 WebSocket 规范的可选协议字符串或数组。
- https://tools.ietf.org/html/rfc6455

### `path`
- 连接url的路径

### `query`
- 连接url的查询参数

### `automaticOpen`
- WebSocket 是否应在实例化后立即尝试连接。可以使用 `ws.open()` 和 `ws.close()`随时手动打开或关闭WebSocket。
- 接受 `true` `false`
- 默认值：`true`

### `reconnectInterval`
- 尝试重新连接之前延迟的毫秒数。
- 默认值 `1000`

### `reconnectDecay`
- 重新连接延迟的增加速率。
- 连接时间为：`reconnectInterval * Math.pow(reconnectDecay, 当前重连次数)`
- 默认值 `1.5`

### `maxReconnectInterval`
- 延迟重新连接尝试的最大毫秒数。
- 默认值 `30000`

### `maxReconnectAttempts`
- 最大重新连接尝试次数。如果为 `null`，则不限制
- 默认值 `null`

### `openTimeoutInterval`
- 在关闭并重试之前等待连接成功的最长时间（以毫秒为单位）。
- 默认值 `2000`

### `binaryType`
- 二进制消息默认类型。
- 可选值 `blob` `arraybuffer`
- 默认值 `blob`

### `pingInterval`
- 心跳检测间隔
- 可选值 `number` `false`，为`false`时则不启用心跳检测
- 默认值 `50000`

### `pingData`
- 心跳检测发送的数据
- 默认值 `ping`

### `typeKey`
- 消息类型的key
- 默认值 `type`

### `payloadKey`
- 消息体的key
- 默认值 `payload`

### `normalCloseCode`
- 正常关闭的code
- 正常关闭后不会进行重新连接
- 默认值 `[1000]`


## 方法

### `open()`
- 初始化并连接WebSocket

### `on(event, callback)`
- 监听事件，内置的事件类型：
  - `WebSocketClient.EVENT.OPEN` 连接成功
  - `WebSocketClient.EVENT.CLOSE` 连接正常关闭
  - `WebSocketClient.EVENT.ERROR` 发生错误
  - `WebSocketClient.EVENT.MESSAGE` 收到消息
  - `WebSocketClient.EVENT.CONNECTING` 重连中
- 也可以是自定义的事件类型

### `off(event, callback)`
- 取消监听事件

### `send(type, payload)`
- 发送消息
- `type` 消息类型
- `payload` 消息体
- 发送到服务端的格式
```json
{
  "type": "type",
  "payload": {
    
  }
}
```

### `sendRaw(message)`
- 发送原始消息
- `message` 消息内容

### `close(code, reason)`
- 正常关闭连接
- `code` 关闭code，默认`1000`
- `reason` 关闭原因


## 参考
* <https://github.com/joewalnes/reconnecting-websocket>
* <https://juejin.cn/post/6896101154371928077>