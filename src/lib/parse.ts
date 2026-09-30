// Parse's browser SDK uses the small `events` compatibility package for its
// internal EventEmitter. It is installed explicitly so Vite bundles it for
// browsers instead of externalizing Node's built-in module.
import Parse from 'parse'

const applicationId = import.meta.env.VITE_PARSE_APPLICATION_ID
const javascriptKey = import.meta.env.VITE_PARSE_JAVASCRIPT_KEY
const serverURL = import.meta.env.VITE_PARSE_SERVER_URL

export const parseReady = Boolean(applicationId && serverURL)

if (parseReady) {
  Parse.initialize(applicationId, javascriptKey || undefined)
  Parse.serverURL = serverURL
}

export default Parse
