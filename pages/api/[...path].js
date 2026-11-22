import app from '../../server/index.js'

// Every /api/* request goes to the same Express API the tests use. Express and multer read the body themselves.
export const config = { api: { bodyParser: false, externalResolver: true, responseLimit: false } }
export default function handler(req, res) { return app(req, res) }
