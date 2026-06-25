import { Effect } from "effect"
import { Tui } from "./src"

Effect.runPromise(Tui.run()).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
