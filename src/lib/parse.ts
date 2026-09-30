// Parse's browser SDK uses the small `events` compatibility package for its
// internal EventEmitter. It is installed explicitly so Vite bundles it for
// browsers instead of externalizing Node's built-in module.
import Parse from 'parse'

// Parse's browser UUID helper assumes crypto.randomUUID() exists. Some Safari
// and embedded/PWA browser versions expose getRandomValues() but not the newer
// randomUUID() method, so provide the equivalent RFC 4122 v4 fallback.
const browserCrypto = globalThis.crypto as Crypto & { randomUUID?: () => string }
if (browserCrypto && typeof browserCrypto.randomUUID !== 'function' && typeof browserCrypto.getRandomValues === 'function') {
  Object.defineProperty(browserCrypto, 'randomUUID', {
    configurable: true,
    value: () => {
      const bytes = new Uint8Array(16)
      browserCrypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    },
  })
}

const applicationId = import.meta.env.VITE_PARSE_APPLICATION_ID
const javascriptKey = import.meta.env.VITE_PARSE_JAVASCRIPT_KEY
const serverURL = import.meta.env.VITE_PARSE_SERVER_URL

export const parseReady = Boolean(applicationId && serverURL)

if (parseReady) {
  Parse.initialize(applicationId, javascriptKey || undefined)
  Parse.serverURL = serverURL
}

export default Parse
