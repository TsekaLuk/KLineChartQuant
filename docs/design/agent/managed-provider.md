# Agent 托管 Provider

## 决策

宿主可以向 `BrowserAgentBridge` 注入一个已验证的 OpenAI-compatible Provider（`managedProvider` 选项）。它由宿主决定连接、凭据与模型，用户界面不需要也不允许填写 Base URL、API Key 或选择模型。

```ts
new BrowserAgentBridge({
  managedProvider: {
    name: 'Managed',
    baseUrl: `${origin}/ai/v1`,
    model: { id: 'auto', name: 'Auto' }, // 真实模型由宿主服务端决定
    credentials: new ReadOnlyProviderCredentialStore('placeholder'),
    fetch: hostFetch, // 例如携带 Cookie、移除 Authorization
  },
})
```

## 契约

- 托管配置是内存投影，**从不写入 LocalStorage**。它始终位于配置列表首位，`ProviderProfileView.managed` 与 `ProviderStatusView.managed` 为 `true`。
- 生效规则：没有任何用户配置处于激活状态时，托管配置生效；用户激活自己的配置后，该选择被持久化并优先；删除激活的用户配置会回到托管配置。
- 单一事实来源：`BrowserProviderProfiles` 推导激活状态并剔除托管配置的写入；`RoutedProviderCredentialStore` 与 bridge 的 `providerFetch()` 按当前生效配置选择凭据与 fetch。运行时（`createOpenAiCompatibleRuntimeSupport`）不感知托管概念，仍只读取凭据与设置。
- 托管配置只读：模型池增删、模型选择、思考强度、测试、凭据删除、重命名、删除、与其重名的保存，均抛出 `PROVIDER_ERROR`。托管凭据不会被带入新建的用户配置。
- 界面：设置面板对托管配置隐藏连接表单与模型列表并显示说明；Composer 隐藏模型选择器。用户仍可新建自己的 Provider。
- `ReadOnlyProviderCredentialStore`（agent-runtime）是配套的只读凭据存储：`read` 返回固定值，`write` / `delete` 拒绝。

## 约束

库保持宿主无关：托管配置里不含任何产品字符串，宿主负责鉴权、模型路由与计费。占位凭据仍会作为 `Authorization: Bearer` 发出，宿主 `fetch` 需要自行移除或替换。
