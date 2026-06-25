import { Auth, Endpoint, Http, Route } from "./route"
import { DeepSeekChat } from "./protocols"

export const route = Route.make({
  id: "deepseek",
  endpoint: Endpoint.make<DeepSeekChat.DeepSeekChatBody>("https://api.deepseek.com/v1/chat/completions"),
  auth: Auth.bearerEnv("DEEPSEEK_API_KEY"),
  protocol: DeepSeekChat.protocol,
  transport: Http.sseJson<DeepSeekChat.DeepSeekChatBody>(),
})
